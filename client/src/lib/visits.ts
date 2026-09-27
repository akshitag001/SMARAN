import {
  clockTime,
  isoDate,
  type Draft,
  type NewVisitRequest,
  type SavedVisitResponse,
  type School,
  type User,
  type Visit,
} from '@smaran/shared';
import { ApiError, OfflineError, newClientId, post } from './api';
import { enqueue, flushOutbox, type OutboxEntry } from './outbox';
import type { VisitFlow } from './flow';

/**
 * Saves a visit. Photos always go through the outbox (they upload in the
 * background and link to the visit whichever arrives first). The visit itself
 * goes straight to the server with signal, or waits on the phone without.
 */
export async function saveVisit(
  flow: VisitFlow,
  school: School,
  lastVisit: Visit | null,
  user: User,
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
    draft: { strength: draft.strength, actions: draft.actions, summary: draft.summary },
    checks: flow.checks,
    reminders: flow.reminders.filter((r) => r.text.trim()).map((r) => ({ clientId: r.clientId, text: r.text.trim() })),
    reminderUpdates: flow.reminderUpdates,
    photoClientIds: flow.photos.map((p) => p.clientId),
  };

  for (const p of flow.photos) {
    await enqueue({ kind: 'photo', id: p.clientId, schoolId: school.id, visitClientId: request.clientId, caption: p.caption, takenAt: p.takenAt, queuedAt: new Date().toISOString() });
  }

  try {
    const saved = await post<SavedVisitResponse>('/visits', request);
    flushOutbox();
    return { ...saved, visit: { ...saved.visit, photos: localPhotos(flow) }, queued: false };
  } catch (err) {
    const keepOnPhone = err instanceof OfflineError || (err instanceof ApiError && err.status >= 500);
    if (!keepOnPhone) throw err;
    const local = localCopy(request, flow, lastVisit, user);
    await enqueue({ kind: 'visit', id: request.clientId, request, local, queuedAt: new Date().toISOString() });
    return { ...local, queued: true };
  }
}

const localPhotos = (flow: VisitFlow) => flow.photos.map((p) => ({ id: p.clientId, caption: p.caption, takenAt: p.takenAt, local: true }));

function localCopy(req: NewVisitRequest, flow: VisitFlow, lastVisit: Visit | null, user: User): SavedVisitResponse {
  const actions = req.draft.actions.map((a) => ({ do: a.do.trim().replace(/[.।]$/, ''), how: a.how.trim() })).filter((a) => a.do);
  const visit: Visit = {
    id: `local-${req.clientId}`,
    schoolId: req.schoolId,
    date: req.date,
    time: req.time,
    mentorId: user.id,
    mentorName: user.name,
    summary: req.draft.summary.trim() || actions.map((a) => a.do).join('; '),
    strength: req.draft.strength.trim(),
    items: actions.map((a, i) => ({ id: `local-${req.clientId}-${i}`, text: a.do, how: a.how, state: 'pending', checkedOn: null, note: null, responses: [] })),
    photos: localPhotos(flow),
    unsynced: true,
  };
  const closed = (lastVisit?.items ?? [])
    .filter((i) => i.state === 'pending' && req.checks[i.id])
    .map((i) => ({ id: i.id, text: i.text, state: req.checks[i.id] }));
  return { visit, closed, remindersAdded: req.reminders.length, remindersClosed: Object.keys(req.reminderUpdates).length };
}

type VisitEntry = Extract<OutboxEntry, { kind: 'visit' }>;
export const queuedVisits = (queue: OutboxEntry[]): VisitEntry[] => queue.filter((e): e is VisitEntry => e.kind === 'visit');

/** Applies queued (unsynced) visits on top of server data for one school. */
export function withQueued(visits: Visit[], queue: OutboxEntry[], schoolId: string): Visit[] {
  const mine = queuedVisits(queue).filter((e) => e.request.schoolId === schoolId);
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
