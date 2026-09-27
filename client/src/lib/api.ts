import { get, set } from 'idb-keyval';
import type { LoginResponse, Session } from '@smaran/shared';

/** The request never reached the server: no signal, or "work offline" is on. */
export class OfflineError extends Error {
  constructor() {
    super('No signal');
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const SESSION_KEY = 'smaran.session.v2';
const OFFLINE_KEY = 'smaran.workOffline';

function readLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the session lasts for this page load only */
  }
}

let session: Session | null = readLocal<Session>(SESSION_KEY);
let workOffline = readLocal<boolean>(OFFLINE_KEY) ?? false;

export const getSession = () => session;
export function setSession(s: LoginResponse | null) {
  session = s;
  writeLocal(SESSION_KEY, s);
}

export const isWorkingOffline = () => workOffline;
export function setWorkingOffline(v: boolean) {
  workOffline = v;
  writeLocal(OFFLINE_KEY, v);
}

export const isOffline = () => workOffline || !navigator.onLine;

const authHeader = (): Record<string, string> => (session ? { Authorization: `Bearer ${session.token}` } : {});

async function send(path: string, init: RequestInit): Promise<Response> {
  if (isOffline()) throw new OfflineError();
  try {
    return await fetch(`/api${path}`, { ...init, headers: { ...authHeader(), ...(init.headers as Record<string, string>) } });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new OfflineError();
  }
}

async function readJson<T>(res: Response, path: string): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (res.status === 401 && path !== '/auth/login') {
    setSession(null);
    window.dispatchEvent(new Event('smaran:signed-out'));
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Something went wrong. Try again.');
  return data as T;
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await send(path, {
    method,
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return readJson<T>(res, path);
}

/**
 * GET that remembers the last good answer in IndexedDB, so screens keep
 * working in a school with no signal.
 */
export async function cachedGet<T>(path: string): Promise<{ data: T; fromCache: boolean }> {
  const key = `${session?.user.id ?? 'anon'} GET ${path}`;
  try {
    const data = await request<T>('GET', path);
    set(key, data).catch(() => {});
    return { data, fromCache: false };
  } catch (err) {
    if (err instanceof OfflineError || (err instanceof ApiError && err.status >= 500)) {
      const hit = await get<T>(key).catch(() => undefined);
      if (hit !== undefined) return { data: hit, fromCache: true };
    }
    throw err;
  }
}

export const post = <T>(path: string, body: unknown, signal?: AbortSignal) => request<T>('POST', path, body, signal);
export const put = <T>(path: string, body: unknown) => request<T>('PUT', path, body);
export const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body);

/** Uploads raw bytes (photos) with metadata in headers. */
export async function upload<T>(path: string, blob: Blob, headers: Record<string, string>): Promise<T> {
  const res = await send(path, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type, ...headers } });
  return readJson<T>(res, path);
}

/** Fetches a protected file (a photo) as a Blob. */
export async function getBlob(path: string): Promise<Blob> {
  const res = await send(path, { method: 'GET' });
  if (!res.ok) throw new ApiError(res.status, 'Could not load the photo.');
  return res.blob();
}

export function login(phone: string, pin: string) {
  return request<LoginResponse>('POST', '/auth/login', { phone, pin });
}

export function problemText(err: unknown): string {
  if (err instanceof OfflineError) return 'No signal, and this screen hasn’t been opened on this phone before. It will load once you’re back online.';
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Try again.';
}

export function newClientId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
