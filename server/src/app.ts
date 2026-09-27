import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  isoDate,
  localDraft,
  type BriefResponse,
  type DraftResponse,
  type HistoryResponse,
  type LoginResponse,
  type TodayResponse,
  type User,
} from '@smaran/shared';
import { allow, issueToken, requireUser, verifyPin } from './auth';
import { aiStatus, draftWithClaude } from './ai/drafter';
import { config } from './config';
import type { DB } from './db/connection';
import { createRepo, RepoError } from './repo';

const DateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Lang = z.enum(['en', 'hi']);
const Role = z.enum(['crp', 'brc', 'teacher']);
const Checks = z.record(z.string(), z.enum(['done', 'partly', 'notyet']));
const ClientId = z.string().min(8).max(64);

const LoginRequest = z.object({
  phone: z.string().regex(/^\d{10}$/, 'Enter a 10-digit mobile number'),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN is 4 to 6 digits'),
});
const DraftRequest = z.object({ schoolId: z.string(), note: z.string().trim().min(3).max(8000), lang: Lang, checks: Checks.default({}) });
const VisitRequest = z.object({
  clientId: ClientId,
  schoolId: z.string(),
  date: DateParam,
  time: z.string().max(20),
  note: z.string().max(8000),
  lang: Lang,
  source: z.enum(['ai', 'local', 'offline', 'self']),
  draft: z.object({
    strength: z.string().max(2000),
    actions: z.array(z.object({ do: z.string().max(500), how: z.string().max(2000) })).max(5),
    summary: z.string().max(500),
  }),
  checks: Checks.default({}),
  reminders: z.array(z.object({ clientId: ClientId, text: z.string().max(500) })).max(10).default([]),
  reminderUpdates: z.record(z.string(), z.enum(['done', 'dropped'])).default({}),
  photoClientIds: z.array(ClientId).max(20).default([]),
});
const ReminderRequest = z.object({ clientId: ClientId, text: z.string().trim().min(3).max(500), date: DateParam });
const ReminderUpdate = z.object({ status: z.enum(['done', 'dropped']), date: DateParam });
const ResponseRequest = z.object({ status: z.enum(['trying', 'done', 'help']), note: z.string().max(1000).default('') });
const PatternEdit = z.object({ title: z.string().trim().min(3).max(200), body: z.string().trim().min(3).max(2000) });
const HandoverRequest = z.object({
  fromUserId: z.string(),
  toUserId: z.string(),
  note: z.string().max(3000).default(''),
  newRole: z.enum(['crp', 'brc', 'teacher', 'inactive']).optional(),
});
const PersonRequest = z.object({
  name: z.string().trim().min(3).max(100),
  phone: z.string().regex(/^\d{10}$/, 'Enter a 10-digit mobile number'),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN is 4 to 6 digits'),
  role: Role,
  clusterId: z.string().nullish(),
  schoolId: z.string().nullish(),
});
const PersonPatch = z.object({ role: Role.optional(), active: z.boolean().optional(), clusterId: z.string().nullable().optional() });
const AssignRequest = z.object({ mentorId: z.string().nullable() });

const PHOTO_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const userOf = (res: Response) => res.locals.user as User;
const param = (req: Request, name = 'id') => String(req.params[name]);
const dateFrom = (req: Request) => {
  const d = DateParam.safeParse(req.query.date);
  return d.success ? d.data : isoDate();
};

export function createApp(db: DB) {
  const repo = createRepo(db);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));
  mkdirSync(config.photoDir, { recursive: true });

  const api = express.Router();

  /** A school the signed-in person may see: their own school for a teacher, their block otherwise. */
  const schoolFor = (user: User, id: string) => {
    const school = repo.school(id);
    const visible = school && (user.role === 'teacher' ? user.schoolId === id : repo.schoolBlockId(id) === user.blockId);
    if (!school || !visible) throw new HttpError(404, 'No school with that id.');
    return school;
  };

  const session = (user: User) => ({
    user,
    block: repo.block(user.blockId),
    cluster: repo.cluster(user.clusterId),
    school: user.schoolId ? repo.school(user.schoolId) : null,
  });

  api.get('/health', (_req, res) => {
    res.json({ ok: true, ai: aiStatus() });
  });

  // Simple in-memory throttle on sign-in attempts per phone number.
  const attempts = new Map<string, { n: number; until: number }>();
  api.post('/auth/login', (req, res) => {
    const { phone, pin } = LoginRequest.parse(req.body);
    const a = attempts.get(phone);
    if (a && a.until > Date.now()) throw new HttpError(429, 'Too many wrong PINs. Wait a few minutes and try again.');
    const found = repo.userByPhone(phone);
    if (!found || !found.active || !verifyPin(pin, found.pinHash)) {
      const n = (a?.n ?? 0) + 1;
      attempts.set(phone, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
      throw new HttpError(401, 'That mobile number and PIN don’t match. Check both and try again.');
    }
    attempts.delete(phone);
    const { pinHash: _omit, ...user } = found;
    const body: LoginResponse = { token: issueToken(user.id), ...session(user) };
    res.json(body);
  });

  api.use(requireUser(repo));

  api.get('/me', (_req, res) => {
    res.json({ ...session(userOf(res)), unread: repo.unreadCount(userOf(res).id) });
  });

  // ── Inbox (everyone) ──

  api.get('/inbox', (_req, res) => {
    res.json(repo.inbox(userOf(res).id));
  });
  api.get('/inbox/unread', (_req, res) => {
    res.json({ unread: repo.unreadCount(userOf(res).id) });
  });
  api.post('/inbox/read', (req, res) => {
    const id = z.object({ id: z.string().optional() }).parse(req.body ?? {}).id;
    repo.markRead(userOf(res).id, id);
    res.json({ unread: repo.unreadCount(userOf(res).id) });
  });

  // ── CRP: the visit loop ──

  api.get('/today', allow('crp'), (req, res) => {
    const user = userOf(res);
    const date = dateFrom(req);
    const body: TodayResponse = {
      date,
      user,
      cluster: repo.cluster(user.clusterId),
      stops: repo.route(user, date),
      reminders: repo.reminders({ assignedTo: user.id, openOnly: true }),
    };
    res.json(body);
  });

  api.post('/drafts', allow('crp', 'brc'), async (req, res) => {
    const input = DraftRequest.parse(req.body);
    const school = schoolFor(userOf(res), input.schoolId);
    const ctx = { school, lastVisit: repo.lastVisitBefore(school.id, isoDate()), checks: input.checks, note: input.note, lang: input.lang };

    // Stop the Claude call if the phone gives up waiting.
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });

    let body: DraftResponse;
    try {
      const draft = await draftWithClaude(ctx, abort.signal);
      body = draft ? { draft, source: 'ai' } : { draft: localDraft(input.note, input.lang), source: 'local' };
    } catch (err) {
      if (abort.signal.aborted) return;
      throw err;
    }
    res.json(body);
  });

  api.post('/visits', allow('crp', 'brc'), (req, res) => {
    const input = VisitRequest.parse(req.body);
    schoolFor(userOf(res), input.schoolId);
    const { created, ...saved } = repo.createVisit(userOf(res), input);
    res.status(created ? 201 : 200).json(saved);
  });

  // ── Schools, history and reminders (CRP and BRC) ──

  api.get('/schools', allow('crp', 'brc'), (req, res) => {
    res.json(repo.schools({ blockId: userOf(res).blockId }, dateFrom(req)));
  });

  api.get('/schools/:id', allow('crp', 'brc'), (req, res) => {
    const school = schoolFor(userOf(res), param(req));
    const body: HistoryResponse = {
      school,
      visits: repo.visits(school.id),
      reminders: repo.reminders({ schoolId: school.id }),
      handovers: repo.handovers({ schoolId: school.id }),
    };
    res.json(body);
  });

  api.get('/schools/:id/brief', allow('crp', 'brc'), (req, res) => {
    const user = userOf(res);
    const school = schoolFor(user, param(req));
    const date = dateFrom(req);
    const handover = repo.handovers({ schoolId: school.id }, 1)[0] ?? null;
    const body: BriefResponse = {
      school,
      lastVisit: repo.lastVisitBefore(school.id, date),
      visitCount: repo.visits(school.id).length,
      stop: repo.routePosition(user.id, date, school.id),
      visitedToday: repo.visitedOn(school.id, date),
      reminders: repo.reminders({ schoolId: school.id, openOnly: true }),
      handover: handover && handover.toId === school.mentorId ? handover : null,
    };
    res.json(body);
  });

  api.put('/schools/:id/mentor', allow('brc'), (req, res) => {
    const { mentorId } = AssignRequest.parse(req.body);
    repo.reassignSchool(userOf(res), param(req), mentorId);
    res.json(repo.school(param(req)));
  });

  api.get('/reminders', allow('crp'), (_req, res) => {
    res.json(repo.reminders({ assignedTo: userOf(res).id, openOnly: true }));
  });

  api.post('/schools/:id/reminders', allow('crp', 'brc'), (req, res) => {
    const input = ReminderRequest.parse(req.body);
    const school = schoolFor(userOf(res), param(req));
    res.status(201).json(repo.addReminder(userOf(res), school.id, input.text, input.clientId, input.date));
  });

  api.post('/reminders/:id', allow('crp', 'brc'), (req, res) => {
    const input = ReminderUpdate.parse(req.body);
    const schoolId = repo.reminderSchool(param(req));
    if (!schoolId) throw new HttpError(404, 'No reminder with that id.');
    schoolFor(userOf(res), schoolId);
    repo.closeReminder(userOf(res), param(req), input.status, input.date);
    res.json({ ok: true });
  });

  // ── Photos ──

  api.post(
    '/photos',
    allow('crp', 'brc'),
    express.raw({ type: Object.keys(PHOTO_TYPES), limit: config.maxPhotoBytes }),
    (req, res) => {
      const user = userOf(res);
      const clientId = ClientId.parse(req.get('x-client-id'));
      const school = schoolFor(user, z.string().parse(req.get('x-school-id')));
      const mime = (req.get('content-type') ?? '').split(';')[0];
      const ext = PHOTO_TYPES[mime];
      if (!ext || !Buffer.isBuffer(req.body) || req.body.length === 0) throw new HttpError(400, 'Send a JPEG, PNG or WebP photo.');
      if (repo.photoExists(clientId)) {
        res.json(repo.addPhoto({ clientId, schoolId: school.id, visitClientId: null, user, caption: '', mime, bytes: 0, file: '', takenAt: '' }));
        return;
      }
      const file = `${randomUUID()}.${ext}`;
      writeFileSync(path.join(config.photoDir, file), req.body);
      const caption = decodeURIComponent(req.get('x-caption') ?? '').slice(0, 300);
      const takenAt = z.string().datetime().catch(new Date().toISOString()).parse(req.get('x-taken-at'));
      const visitClientId = req.get('x-visit-client-id') || null;
      res.status(201).json(repo.addPhoto({ clientId, schoolId: school.id, visitClientId, user, caption, mime, bytes: req.body.length, file, takenAt }));
    },
  );

  api.get('/photos/:id', (req, res) => {
    const photo = repo.photo(param(req));
    if (!photo) throw new HttpError(404, 'No photo with that id.');
    schoolFor(userOf(res), photo.schoolId);
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.type(photo.mime).sendFile(path.join(config.photoDir, photo.file));
  });

  // ── Patterns ──

  const patternScope = (req: Request, user: User): { kind: 'cluster' | 'block'; id: string } => {
    const cluster = typeof req.query.cluster === 'string' ? req.query.cluster : null;
    if (cluster) {
      if (repo.cluster(cluster)?.blockId !== user.blockId) throw new HttpError(404, 'No such cluster in your block.');
      return { kind: 'cluster', id: cluster };
    }
    return user.role === 'crp' && user.clusterId ? { kind: 'cluster', id: user.clusterId } : { kind: 'block', id: user.blockId };
  };

  api.get('/patterns', allow('crp', 'brc'), (req, res) => {
    res.json(repo.patterns(patternScope(req, userOf(res)), dateFrom(req)));
  });

  api.put('/patterns/:theme', allow('crp', 'brc'), (req, res) => {
    const { title, body } = PatternEdit.parse(req.body);
    repo.editPattern(patternScope(req, userOf(res)), param(req, 'theme'), title, body, userOf(res).id);
    res.json({ ok: true });
  });

  // ── Handovers ──

  api.get('/handover/preview', allow('crp', 'brc'), (req, res) => {
    const user = userOf(res);
    const fromId = typeof req.query.from === 'string' ? req.query.from : user.id;
    if (user.role !== 'brc' && fromId !== user.id) throw new HttpError(403, 'You can only hand over your own schools.');
    const from = repo.user(fromId);
    if (!from || from.blockId !== user.blockId) throw new HttpError(404, 'No such person in your block.');
    res.json(repo.handoverPreview(from));
  });

  api.post('/handovers', allow('crp', 'brc'), (req, res) => {
    const input = HandoverRequest.parse(req.body);
    res.status(201).json(repo.handover(userOf(res), input, dateFrom(req)));
  });

  // ── Block coordinator ──

  api.get('/block', allow('brc'), (req, res) => {
    res.json(repo.blockOverview(userOf(res).blockId, dateFrom(req)));
  });

  api.get('/users/:id/caseload', allow('brc'), (req, res) => {
    const person = repo.user(param(req));
    if (!person || person.blockId !== userOf(res).blockId) throw new HttpError(404, 'No such person in your block.');
    res.json(repo.caseload(person, dateFrom(req)));
  });

  api.get('/people', allow('brc'), (_req, res) => {
    const blockId = userOf(res).blockId;
    res.json({
      people: repo.people(blockId),
      clusters: repo.clusters(blockId),
      schools: repo.schools({ blockId }, isoDate()).map((s) => ({ id: s.id, name: s.name, clusterId: s.clusterId })),
    });
  });

  api.post('/people', allow('brc'), (req, res) => {
    res.status(201).json(repo.addPerson(userOf(res), PersonRequest.parse(req.body)));
  });

  api.patch('/people/:id', allow('brc'), (req, res) => {
    res.json(repo.updatePerson(userOf(res), param(req), PersonPatch.parse(req.body)));
  });

  // ── Teacher ──

  api.get('/teacher/home', allow('teacher'), (_req, res) => {
    const user = userOf(res);
    if (!user.schoolId) throw new HttpError(400, 'Your account isn’t linked to a school yet. Ask your block coordinator.');
    res.json(repo.teacherHome(user));
  });

  api.post('/suggestions/:id/responses', allow('teacher'), (req, res) => {
    const input = ResponseRequest.parse(req.body);
    res.status(201).json(repo.addResponse(userOf(res), param(req), input.status, input.note));
  });

  api.use((_req, _res) => {
    throw new HttpError(404, 'Not found.');
  });

  app.use('/api', api);

  // In production, serve the built PWA and let the client router handle other paths.
  if (existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.set('Cache-Control', 'no-cache').sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.issues.map((i) => i.message).join('. ') });
      return;
    }
    if (err instanceof HttpError || err instanceof RepoError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: 'The request body is not valid JSON.' });
      return;
    }
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.too.large') {
      res.status(413).json({ error: 'That photo is too large. Try again; the app shrinks photos before sending.' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server. Your note is still saved on the phone.' });
  });

  return app;
}
