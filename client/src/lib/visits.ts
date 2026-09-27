import {
  clockTime,
  isoDate,
  type Mentor,
  type NewVisitRequest,
  type SavedVisitResponse,
  type Visit,
  type School,
  type Draft,
} from '@smaran/shared';
import { ApiError, OfflineError, post } from './api';
import { enqueue, type OutboxEntry } from './outbox';
import type { VisitFlow } from './flow';

function newClientId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Saves a visit. With signal it goes straight to the server; without, it goes
 * to the outbox and the phone shows its own copy until sync.
 */
export async function saveVisit(
  flow: VisitFlow,
  school: School,
  lastVisit: Visit | null,
  mentor: Mentor,
): Promise<SavedVisitResponse & { queued: boolean }> {
  const draft = flow.draft as Draft;
  const request: NewVisitRequest = {
    clientId: newClientId(),
    schoolId: school.id,
    date: isoDate(),
    time: clockTime(),
    note: flow.note,
    lang: flow.lang,
    source: flow.source ?? 'self',
    draft,
    checks: flow.checks,
  };

  try {
    const saved = await post<SavedVisitResponse>('/visits', request);
    return { ...saved, queued: false };
  } catch (err) {
    const keepOnPhone = err instanceof OfflineError || (err instanceof ApiError && err.status >= 500);
    if (!keepOnPhone) throw err;
    const local = localCopy(request, lastVisit, mentor);
    const entry: OutboxEntry = { request, local, queuedAt: new Date().toISOString() };
    await enqueue(entry);
    return { ...local, queued: true };
  }
}

function localCopy(req: NewVisitRequest, lastVisit: Visit | null, mentor: Mentor): SavedVisitResponse {
  const actions = req.draft.actions.map((a) => ({ do: a.do.trim().replace(/[.।]$/, ''), how: a.how.trim() })).filter((a) => a.do);
  const visit: Visit = {
    id: `local-${req.clientId}`,
    schoolId: req.schoolId,
    date: req.date,
    time: req.time,
    mentorId: mentor.id,
    mentorName: mentor.name,
    summary: req.draft.summary.trim() || actions.map((a) => a.do).join('; '),
    strength: req.draft.strength.trim(),
    items: actions.map((a, i) => ({ id: `local-${req.clientId}-${i}`, text: a.do, how: a.how, state: 'pending', checkedOn: null, note: null })),
    unsynced: true,
  };
  const closed = (lastVisit?.items ?? [])
    .filter((i) => i.state === 'pending' && req.checks[i.id])
    .map((i) => ({ id: i.id, text: i.text, state: req.checks[i.id] }));
  return { visit, closed };
}

/** Applies queued (unsynced) visits on top of server data for one school. */
export function withQueued(visits: Visit[], queue: OutboxEntry[], schoolId: string): Visit[] {
  const mine = queue.filter((e) => e.request.schoolId === schoolId);
  if (!mine.length) return visits;
  const checked = new Map<string, { state: 'done' | 'partly' | 'notyet'; on: string }>();
  for (const e of mine) for (const [id, state] of Object.entries(e.request.checks)) checked.set(id, { state, on: e.request.date });
  const patched = visits.map((v) => ({
    ...v,
    items: v.items.map((i) => {
      const c = i.state === 'pending' ? checked.get(i.id) : undefined;
      return c ? { ...i, state: c.state, checkedOn: c.on } : i;
    }),
  }));
  return [...mine.map((e) => e.local.visit).reverse(), ...patched];
}
