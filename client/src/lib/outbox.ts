import { get, set } from 'idb-keyval';
import type { NewVisitRequest, SavedVisitResponse } from '@smaran/shared';
import { ApiError, OfflineError, post } from './api';

/**
 * Visits saved on the phone and not yet on the server. A visit is never lost:
 * it stays here until the server confirms it (the server ignores repeats by clientId).
 */
export interface OutboxEntry {
  request: NewVisitRequest;
  /** What the phone shows until the server's copy arrives. */
  local: SavedVisitResponse;
  queuedAt: string;
  lastError?: string;
}

const KEY = 'smaran.outbox';
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
  await write([...entries.filter((e) => e.request.clientId !== entry.request.clientId), entry]);
}

let flushing: Promise<number> | null = null;

/** Sends queued visits in order. Returns how many were sent. */
export function flushOutbox(): Promise<number> {
  flushing ??= (async () => {
    let sent = 0;
    try {
      for (const entry of await listOutbox()) {
        try {
          await post<SavedVisitResponse>('/visits', entry.request);
          await write((await listOutbox()).filter((e) => e.request.clientId !== entry.request.clientId));
          sent++;
        } catch (err) {
          if (err instanceof OfflineError || (err instanceof ApiError && (err.status >= 500 || err.status === 401))) break;
          // The server refused this visit. Keep it, with the reason, so nothing is silently dropped.
          const message = err instanceof Error ? err.message : 'Could not sync';
          await write((await listOutbox()).map((e) => (e.request.clientId === entry.request.clientId ? { ...e, lastError: message } : e)));
        }
      }
    } finally {
      flushing = null;
    }
    return sent;
  })();
  return flushing;
}
