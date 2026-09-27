import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  isoDate,
  type BlockOverview,
  type BriefResponse,
  type HandoverPreview,
  type HistoryResponse,
  type InboxItem,
  type SavedVisitResponse,
  type TeacherHomeResponse,
  type TodayResponse,
} from '@smaran/shared';

process.env.SMARAN_AI = 'off';
process.env.SMARAN_PHOTOS = mkdtempSync(path.join(tmpdir(), 'smaran-photos-'));
const { openDb } = await import('../src/db/connection');
const { seedDemo, DEMO_PIN, DEMO_USERS } = await import('../src/db/seed');
const { createApp } = await import('../src/app');

const today = isoDate();
const tomorrow = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return isoDate(d);
})();

let app: ReturnType<typeof createApp>;
const as: Record<'crp' | 'brc' | 'teacher', { Authorization: string }> = {} as never;

async function signIn(phone: string) {
  const res = await request(app).post('/api/auth/login').send({ phone, pin: DEMO_PIN });
  return { Authorization: `Bearer ${res.body.token}` };
}

beforeEach(async () => {
  const db = openDb(':memory:');
  seedDemo(db, today);
  app = createApp(db);
  as.crp = await signIn(DEMO_USERS.crp.phone);
  as.brc = await signIn(DEMO_USERS.brc.phone);
  as.teacher = await signIn(DEMO_USERS.teacher.phone);
});

const visitPayload = (overrides: Record<string, unknown> = {}) => ({
  clientId: 'test-client-0001',
  schoolId: 'ratanpur',
  date: today,
  time: '11:05 am',
  note: 'Called two names from the back. Examples still fast. Next time check the slates.',
  lang: 'en',
  source: 'local',
  draft: { strength: 'Two children from the back were asked by name.', actions: [{ do: 'Check slates after each example.', how: 'Hold up slates.' }], summary: 'Progress on names; pace still fast.' },
  checks: {},
  reminders: [{ clientId: 'rem-client-0001', text: 'Check the slates' }],
  reminderUpdates: {},
  photoClientIds: [],
  ...overrides,
});

describe('sign-in and roles', () => {
  it('rejects a wrong PIN', async () => {
    const res = await request(app).post('/api/auth/login').send({ phone: DEMO_USERS.crp.phone, pin: '0000' });
    expect(res.status).toBe(401);
  });
  it('requires a session for data', async () => {
    expect((await request(app).get('/api/today')).status).toBe(401);
  });
  it('keeps each role to its own screens', async () => {
    expect((await request(app).get('/api/block').set(as.crp)).status).toBe(403);
    expect((await request(app).get('/api/today').set(as.teacher)).status).toBe(403);
    expect((await request(app).get('/api/schools/semri').set(as.teacher)).status).toBe(403);
    expect((await request(app).get('/api/teacher/home').set(as.crp)).status).toBe(403);
  });
});

describe('the visit loop', () => {
  it('shows today’s route with what to check and the CRP’s reminders', async () => {
    const body = (await request(app).get(`/api/today?date=${today}`).set(as.crp)).body as TodayResponse;
    expect(body.stops.map((s) => s.school.id)).toEqual(['jhagariya', 'ratanpur', 'bilkhiriya', 'semri', 'kolukhedi']);
    expect(body.stops[1].school.toCheck).toBe(2);
    expect(body.reminders.map((r) => r.schoolId).sort()).toEqual(['bilkhiriya', 'kolukhedi', 'ratanpur', 'semri']);
  });

  it('briefs with open reminders, the teacher’s replies and the handover that brought the school', async () => {
    const brief = (await request(app).get(`/api/schools/ratanpur/brief?date=${today}`).set(as.crp)).body as BriefResponse;
    expect(brief.reminders[0].text).toBe('Check whether the library register is being filled');
    expect(brief.lastVisit!.items[1].responses[0].status).toBe('help');
    expect(brief.handover?.fromName).toBe('Anita Verma');
  });

  it('drafts on the server and finds reminders in the note', async () => {
    const res = await request(app).post('/api/drafts').set(as.crp).send({ schoolId: 'ratanpur', note: 'Examples were rushed. Next time check the library register.', lang: 'en' });
    expect(res.body.source).toBe('local');
    expect(res.body.draft.reminders).toEqual(['Check the library register']);
  });

  it('saves a visit, closes follow-ups and reminders, and resurfaces the new ones next time', async () => {
    const brief = (await request(app).get(`/api/schools/ratanpur/brief?date=${today}`).set(as.crp)).body as BriefResponse;
    const [first, second] = brief.lastVisit!.items;
    const payload = visitPayload({
      checks: { [first.id]: 'partly', [second.id]: 'notyet' },
      reminderUpdates: { [brief.reminders[0].id]: 'done' },
    });

    const res = await request(app).post('/api/visits').set(as.crp).send(payload);
    expect(res.status).toBe(201);
    const saved = res.body as SavedVisitResponse;
    expect(saved.closed.map((c) => c.state)).toEqual(['partly', 'notyet']);
    expect(saved.remindersAdded).toBe(1);
    expect(saved.remindersClosed).toBe(1);

    // Syncing the same visit again does not duplicate it.
    expect((await request(app).post('/api/visits').set(as.crp).send(payload)).status).toBe(200);
    const history = (await request(app).get('/api/schools/ratanpur').set(as.crp)).body as HistoryResponse;
    expect(history.visits).toHaveLength(5);

    // Tomorrow, the new suggestion and reminder are what to check.
    const next = (await request(app).get(`/api/schools/ratanpur/brief?date=${tomorrow}`).set(as.crp)).body as BriefResponse;
    expect(next.lastVisit!.items.map((i) => i.state)).toEqual(['pending']);
    expect(next.reminders.map((r) => r.text)).toEqual(['Check the slates']);

    // The teacher is told, and sees the feedback.
    const inbox = (await request(app).get('/api/inbox').set(as.teacher)).body as InboxItem[];
    expect(inbox[0].title).toBe('New feedback from Suresh Rathore');
  });
});

describe('photos', () => {
  it('stores a photo, links it to its visit whichever arrives first, and serves it only within the block', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
    const up = await request(app)
      .post('/api/photos')
      .set(as.crp)
      .set('Content-Type', 'image/jpeg')
      .set('X-Client-Id', 'photo-client-01')
      .set('X-School-Id', 'ratanpur')
      .set('X-Visit-Client-Id', 'test-client-0001')
      .set('X-Caption', encodeURIComponent('Slates on the table'))
      .send(jpeg);
    expect(up.status).toBe(201);

    await request(app).post('/api/visits').set(as.crp).send(visitPayload({ photoClientIds: ['photo-client-01'] }));
    const history = (await request(app).get('/api/schools/ratanpur').set(as.crp)).body as HistoryResponse;
    expect(history.visits[0].photos[0].caption).toBe('Slates on the table');

    const img = await request(app).get(`/api/photos/${up.body.id}`).set(as.teacher);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toContain('image/jpeg');
  });
});

describe('teachers', () => {
  it('see their feedback and reply, and the CRP is told', async () => {
    const home = (await request(app).get('/api/teacher/home').set(as.teacher)).body as TeacherHomeResponse;
    expect(home.school.id).toBe('ratanpur');
    const suggestion = home.visits[0].items[0];
    const res = await request(app).post(`/api/suggestions/${suggestion.id}/responses`).set(as.teacher).send({ status: 'done', note: 'Every row gets a turn now.' });
    expect(res.status).toBe(201);
    const inbox = (await request(app).get('/api/inbox').set(as.crp)).body as InboxItem[];
    expect(inbox[0].title).toBe('Kavita Yadav has done a suggestion at GPS Ratanpur');
  });

  it('cannot reply for another school', async () => {
    const other = (await request(app).get('/api/schools/semri').set(as.crp)).body as HistoryResponse;
    const res = await request(app).post(`/api/suggestions/${other.visits[0].items[0].id}/responses`).set(as.teacher).send({ status: 'done' });
    expect(res.status).toBe(404);
  });
});

describe('reminders outside a visit', () => {
  it('lets the coordinator leave a reminder for the school’s CRP', async () => {
    const res = await request(app).post('/api/schools/semri/reminders').set(as.brc).send({ clientId: 'rem-brc-0001', text: 'Collect the SMC meeting minutes', date: today });
    expect(res.status).toBe(201);
    expect(res.body.assignedToName).toBe('Suresh Rathore');
    const inbox = (await request(app).get('/api/inbox').set(as.crp)).body as InboxItem[];
    expect(inbox[0].title).toBe('Meera Joshi added a reminder for GPS Semri Kalan');
  });
});

describe('handovers and role changes', () => {
  it('moves a CRP’s schools and open reminders to a colleague, then the role can change', async () => {
    const preview = (await request(app).get('/api/handover/preview?from=suresh').set(as.brc)).body as HandoverPreview;
    expect(preview.schools).toHaveLength(15);
    expect(preview.openReminders).toBe(4);
    expect(preview.candidates.map((c) => c.id)).toContain('vikram');

    // A CRP with schools can't be moved to another role before handing over.
    expect((await request(app).patch('/api/people/suresh').set(as.brc).send({ role: 'brc' })).status).toBe(409);

    const res = await request(app)
      .post(`/api/handovers?date=${today}`)
      .set(as.brc)
      .send({ fromUserId: 'suresh', toUserId: 'vikram', note: 'Ratanpur needs slates.', newRole: 'brc' });
    expect(res.status).toBe(201);
    expect(res.body.schoolCount).toBe(15);
    expect(res.body.reminderCount).toBe(4);

    const vikram = await signIn('9876500055');
    const today2 = (await request(app).get(`/api/today?date=${tomorrow}`).set(vikram)).body as TodayResponse;
    expect(today2.stops).toHaveLength(5);
    expect(today2.reminders).toHaveLength(4);
    const brief = (await request(app).get(`/api/schools/ratanpur/brief?date=${tomorrow}`).set(vikram)).body as BriefResponse;
    expect(brief.handover?.note).toBe('Ratanpur needs slates.');

    const block = (await request(app).get(`/api/block?date=${today}`).set(as.brc)).body as BlockOverview;
    expect(block.mentors.find((m) => m.user.id === 'vikram')?.schools).toBe(15);
    expect(block.mentors.some((m) => m.user.id === 'suresh')).toBe(false);
  });

  it('lets a CRP hand over only their own schools', async () => {
    const res = await request(app).post('/api/handovers').set(as.crp).send({ fromUserId: 'anita', toUserId: 'vikram' });
    expect(res.status).toBe(403);
  });
});

describe('block view', () => {
  it('shows coverage per CRP and schools that are overdue or unassigned', async () => {
    const block = (await request(app).get(`/api/block?date=${today}`).set(as.brc)).body as BlockOverview;
    const suresh = block.mentors.find((m) => m.user.id === 'suresh')!;
    expect(suresh.schools).toBe(15);
    expect(block.unassigned.map((s) => s.id).sort()).toEqual(['chandanpura', 'kerwa']);
    expect(block.overdue.some((o) => o.school.id === 'kolukhedi' && o.days === null)).toBe(true);
  });

  it('reassigns a single school and tells the new CRP', async () => {
    const res = await request(app).put('/api/schools/kerwa/mentor').set(as.brc).send({ mentorId: 'vikram' });
    expect(res.body.mentorName).toBe('Vikram Singh');
    const vikram = await signIn('9876500055');
    const inbox = (await request(app).get('/api/inbox').set(vikram)).body as InboxItem[];
    expect(inbox[0].title).toBe('GPS Kerwa is now one of your schools');
  });

  it('adds a person who can then sign in', async () => {
    const res = await request(app).post('/api/people').set(as.brc).send({ name: 'Smt. Pooja Meena', phone: '9876500099', pin: '4321', role: 'teacher', schoolId: 'kolukhedi' });
    expect(res.status).toBe(201);
    expect(res.body.firstName).toBe('Pooja');
    const login = await request(app).post('/api/auth/login').send({ phone: '9876500099', pin: '4321' });
    expect(login.body.school.id).toBe('kolukhedi');
  });

  it('finds patterns across the block and per cluster', async () => {
    const block = await request(app).get(`/api/patterns?date=${today}`).set(as.brc);
    expect(block.body.scope.kind).toBe('block');
    expect(block.body.schools).toHaveLength(21);
    const cluster = await request(app).get(`/api/patterns?date=${today}`).set(as.crp);
    expect(cluster.body.scope.id).toBe('bhanpur');
    expect(cluster.body.patterns.map((p: { theme: string }) => p.theme)).toContain('levels');
  });
});
