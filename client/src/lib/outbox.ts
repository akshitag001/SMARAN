import { del, get, set } from 'idb-keyval';
import type { NewVisitRequest, PhotoRef, SavedVisitResponse } from '@smaran/shared';
import { ApiError, OfflineError, post, upload } from './api';

/**
 * Everything saved on the phone and not yet on the server: visits, photos,
 * reminders and teacher replies. Nothing is lost: an entry stays until the server
 * confirms it, and the server ignores repeats by client id.
 */
export type OutboxEntry =
  | { kind: 'visit'; id: string; request: NewVisitRequest; local: SavedVisitResponse; queuedAt: string; lastError?: string }
  | {
      kind: 'photo';
      id: string;
      schoolId: string;
      visitClientId: string | null;
      caption: string;
      takenAt: string;
      queuedAt: string;
      lastError?: string;
    }
  | { kind: 'post'; id: string; label: string; path: string; body: unknown; queuedAt: string; lastError?: string };

const KEY = 'smaran.outbox.v2';
export const photoBlobKey = (clientId: string) => `smaran.photo.pending.${clientId}`;
export const photoCacheKey = (id: string) => `smaran.photo.${id}`;

type Listener = (entries: OutboxEntry[]) => void;
const listeners = new Set<Listener>();

export async function listOutbox(): Promise<OutboxEntry[]> {
  return (await get<OutboxEntry[]>(KEY).catch(() => undefined)) ?? [];
}

async function write(entries: OutboxEntry[]) {
  await set(KEY, entries);
  listeners.forEach((l) => l(entries));
}

export function onOutboxChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function enqueue(entry: OutboxEntry) {
  const entries = await listOutbox();
  await write([...entries.filter((e) => e.id !== entry.id), entry]);
}

async function send(entry: OutboxEntry) {
  if (entry.kind === 'visit') {
    await post<SavedVisitResponse>('/visits', entry.request);
  } else if (entry.kind === 'photo') {
    const blob = await get<Blob>(photoBlobKey(entry.id));
    if (!blob) return; // Nothing left to send.
    const saved = await upload<PhotoRef>('/photos', blob, {
      'X-Client-Id': entry.id,
      'X-School-Id': entry.schoolId,
      'X-Caption': encodeURIComponent(entry.caption),
      'X-Taken-At': entry.takenAt,
      ...(entry.visitClientId ? { 'X-Visit-Client-Id': entry.visitClientId } : {}),
    });
    // Keep the picture on the phone under its server id, so it still shows offline.
    await set(photoCacheKey(saved.id), blob);
    await del(photoBlobKey(entry.id));
  } else {
    await post(entry.path, entry.body);
  }
}

let flushing: Promise<number> | null = null;

/** Sends queued entries in order. Returns how many were sent. */
export function flushOutbox(): Promise<number> {
  flushing ??= (async () => {
    let sent = 0;
    try {
      for (const entry of await listOutbox()) {
        try {
          await send(entry);
          await write((await listOutbox()).filter((e) => e.id !== entry.id));
          sent++;
        } catch (err) {
          if (err instanceof OfflineError || (err instanceof ApiError && (err.status >= 500 || err.status === 401))) break;
          // The server refused this entry. Keep it, with the reason, so nothing is silently dropped.
          const message = err instanceof Error ? err.message : 'Could not sync';
          await write((await listOutbox()).map((e) => (e.id === entry.id ? { ...e, lastError: message } : e)));
        }
      }
    } finally {
      flushing = null;
    }
    return sent;
  })();
  return flushing;
}

/** Posts now, or keeps it on the phone to send later. Returns true when it was sent. */
export async function postOrQueue(label: string, path: string, body: { clientId?: string; [key: string]: unknown }): Promise<boolean> {
  try {
    await post(path, body);
    return true;
  } catch (err) {
    if (!(err instanceof OfflineError || (err instanceof ApiError && err.status >= 500))) throw err;
    await enqueue({ kind: 'post', id: body.clientId ?? `${path}-${Date.now()}`, label, path, body, queuedAt: new Date().toISOString() });
    return false;
  }
}
