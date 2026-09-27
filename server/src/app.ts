import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  isoDate,
  localDraft,
  type BriefResponse,
  type DraftResponse,
  type HistoryResponse,
  type LoginResponse,
  type Mentor,
  type TodayResponse,
} from '@smaran/shared';
import { issueToken, requireMentor, verifyPin } from './auth';
import { aiStatus, draftWithClaude } from './ai/drafter';
import { config } from './config';
import type { DB } from './db/connection';
import { createRepo } from './repo';

const DateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Lang = z.enum(['en', 'hi']);
const Checked = z.enum(['done', 'partly', 'notyet']);
const Checks = z.record(z.string(), Checked);
const DraftBody = z.object({
  strength: z.string().max(2000),
  actions: z.array(z.object({ do: z.string().max(500), how: z.string().max(2000) })).max(5),
  summary: z.string().max(500),
});

const LoginRequest = z.object({ phone: z.string().regex(/^\d{10}$/, 'Enter a 10-digit mobile number'), pin: z.string().regex(/^\d{4,6}$/, 'PIN is 4 to 6 digits') });
const DraftRequest = z.object({ schoolId: z.string(), note: z.string().trim().min(3).max(8000), lang: Lang, checks: Checks.default({}) });
const VisitRequest = z.object({
  clientId: z.string().min(8).max(64),
  schoolId: z.string(),
  date: DateParam,
  time: z.string().max(20),
  note: z.string().max(8000),
  lang: Lang,
  source: z.enum(['ai', 'local', 'offline', 'self']),
  draft: DraftBody,
  checks: Checks.default({}),
});
const PatternEdit = z.object({ title: z.string().trim().min(3).max(200), body: z.string().trim().min(3).max(2000) });

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const mentorOf = (res: Response) => res.locals.mentor as Mentor;
const dateFrom = (req: Request) => {
  const d = DateParam.safeParse(req.query.date);
  return d.success ? d.data : isoDate();
};

export function createApp(db: DB) {
  const repo = createRepo(db);
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '200kb' }));

  const api = express.Router();

  api.get('/health', (_req, res) => {
    res.json({ ok: true, ai: aiStatus() });
  });

  // Simple in-memory throttle on sign-in attempts per phone number.
  const attempts = new Map<string, { n: number; until: number }>();
  api.post('/auth/login', (req, res) => {
    const { phone, pin } = LoginRequest.parse(req.body);
    const a = attempts.get(phone);
    if (a && a.until > Date.now()) throw new HttpError(429, 'Too many wrong PINs. Wait a few minutes and try again.');
    const mentor = repo.mentorByPhone(phone);
    if (!mentor || !verifyPin(pin, mentor.pinHash)) {
      const n = (a?.n ?? 0) + 1;
      attempts.set(phone, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
      throw new HttpError(401, 'That mobile number and PIN don’t match. Check both and try again.');
    }
    attempts.delete(phone);
    const { pinHash: _omit, ...pub } = mentor;
    const body: LoginResponse = { token: issueToken(mentor.id), mentor: pub, cluster: repo.cluster(mentor.clusterId)! };
    res.json(body);
  });

  api.use(requireMentor(repo));

  api.get('/me', (_req, res) => {
    const mentor = mentorOf(res);
    res.json({ mentor, cluster: repo.cluster(mentor.clusterId) });
  });

  api.get('/today', (req, res) => {
    const mentor = mentorOf(res);
    const date = dateFrom(req);
    const body: TodayResponse = { date, mentor, cluster: repo.cluster(mentor.clusterId)!, stops: repo.route(mentor, date) };
    res.json(body);
  });

  api.get('/schools', (req, res) => {
    res.json(repo.schools(mentorOf(res).clusterId, dateFrom(req)));
  });

  const schoolOr404 = (id: string) => {
    const s = repo.school(id);
    if (!s) throw new HttpError(404, 'No school with that id.');
    return s;
  };

  api.get('/schools/:id', (req, res) => {
    const school = schoolOr404(req.params.id);
    const body: HistoryResponse = { school, visits: repo.visits(school.id) };
    res.json(body);
  });

  api.get('/schools/:id/brief', (req, res) => {
    const school = schoolOr404(req.params.id);
    const date = dateFrom(req);
    const body: BriefResponse = {
      school,
      lastVisit: repo.lastVisitBefore(school.id, date),
      visitCount: repo.visits(school.id).length,
      stop: repo.routePosition(mentorOf(res).id, date, school.id),
      visitedToday: repo.visitedOn(school.id, date),
    };
    res.json(body);
  });

  api.post('/drafts', async (req, res) => {
    const input = DraftRequest.parse(req.body);
    const school = schoolOr404(input.schoolId);
    const ctx = { school, lastVisit: repo.lastVisitBefore(school.id, isoDate()), checks: input.checks, note: input.note, lang: input.lang };

    // Stop the Claude call if the phone gives up waiting.
    const abort = new AbortController();
    res.on('close', () => { if (!res.writableEnded) abort.abort(); });

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

  api.post('/visits', (req, res) => {
    const input = VisitRequest.parse(req.body);
    schoolOr404(input.schoolId);
    const { created, ...saved } = repo.createVisit(mentorOf(res), input);
    res.status(created ? 201 : 200).json(saved);
  });

  api.get('/patterns', (req, res) => {
    res.json(repo.patterns(mentorOf(res).clusterId, dateFrom(req)));
  });

  api.put('/patterns/:theme', (req, res) => {
    const { title, body } = PatternEdit.parse(req.body);
    const mentor = mentorOf(res);
    repo.editPattern(mentor.clusterId, req.params.theme, title, body, mentor.id);
    res.json({ ok: true });
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
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: 'The request body is not valid JSON.' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server. Your note is still saved on the phone.' });
  });

  return app;
}
