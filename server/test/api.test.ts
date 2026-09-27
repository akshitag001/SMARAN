import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { isoDate, type BriefResponse, type HistoryResponse, type SavedVisitResponse, type TodayResponse } from '@smaran/shared';

process.env.SMARAN_AI = 'off';
const { openDb } = await import('../src/db/connection');
const { seedDemo, DEMO_LOGIN } = await import('../src/db/seed');
const { createApp } = await import('../src/app');

const today = isoDate();
let app: ReturnType<typeof createApp>;
let auth: { Authorization: string };

beforeEach(async () => {
  const db = openDb(':memory:');
  seedDemo(db, today);
  app = createApp(db);
  const res = await request(app).post('/api/auth/login').send(DEMO_LOGIN);
  auth = { Authorization: `Bearer ${res.body.token}` };
});

describe('auth', () => {
  it('rejects a wrong PIN', async () => {
    const res = await request(app).post('/api/auth/login').send({ phone: DEMO_LOGIN.phone, pin: '0000' });
    expect(res.status).toBe(401);
  });
  it('requires a session for data', async () => {
    expect((await request(app).get('/api/today')).status).toBe(401);
  });
});

describe('the visit loop', () => {
  it('shows today’s route with what to check', async () => {
    const res = await request(app).get(`/api/today?date=${today}`).set(auth);
    const body = res.body as TodayResponse;
    expect(body.stops.map((s) => s.school.id)).toEqual(['jhagariya', 'ratanpur', 'bilkhiriya', 'semri', 'kolukhedi']);
    expect(body.stops[0].visit?.savedCount).toBe(1);
    expect(body.stops[1].school.toCheck).toBe(2);
  });

  it('drafts feedback on the server without Claude', async () => {
    const res = await request(app).post('/api/drafts').set(auth).send({ schoolId: 'ratanpur', note: 'Examples were rushed and only the front row answered.', lang: 'en' });
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('local');
    expect(res.body.draft.actions.length).toBeGreaterThan(0);
  });

  it('saves a visit, closes last visit’s items, and resurfaces the new ones next time', async () => {
    const brief = (await request(app).get(`/api/schools/ratanpur/brief?date=${today}`).set(auth)).body as BriefResponse;
    const [first, second] = brief.lastVisit!.items;

    const payload = {
      clientId: 'test-client-0001',
      schoolId: 'ratanpur',
      date: today,
      time: '11:05 am',
      note: 'Called two names from the back. Examples still fast.',
      lang: 'en',
      source: 'local',
      draft: { strength: 'Two children from the back were asked by name.', actions: [{ do: 'Check slates after each example.', how: 'Hold up slates.' }], summary: 'Progress on names; pace still fast.' },
      checks: { [first.id]: 'partly', [second.id]: 'notyet' },
    };
    const res = await request(app).post('/api/visits').set(auth).send(payload);
    expect(res.status).toBe(201);
    const saved = res.body as SavedVisitResponse;
    expect(saved.closed.map((c) => c.state)).toEqual(['partly', 'notyet']);
    expect(saved.visit.items[0].text).toBe('Check slates after each example');

    // Syncing the same visit again does not duplicate it.
    const again = await request(app).post('/api/visits').set(auth).send(payload);
    expect(again.status).toBe(200);
    const history = (await request(app).get('/api/schools/ratanpur').set(auth)).body as HistoryResponse;
    expect(history.visits).toHaveLength(5);

    // Tomorrow, the new suggestion is what to check.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const next = (await request(app).get(`/api/schools/ratanpur/brief?date=${isoDate(tomorrow)}`).set(auth)).body as BriefResponse;
    expect(next.lastVisit!.items.map((i) => i.state)).toEqual(['pending']);
    expect(next.lastVisit!.mentorName).toBe('Suresh Rathore');
  });

  it('finds patterns across the cluster', async () => {
    const res = await request(app).get(`/api/patterns?date=${today}`).set(auth);
    const themes = res.body.patterns.map((p: { theme: string }) => p.theme);
    expect(themes).toContain('levels');
    expect(res.body.schools).toHaveLength(15);
  });
});
