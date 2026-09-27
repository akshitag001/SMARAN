import { useSyncExternalStore } from 'react';
import type { CheckedState, Draft, DraftSource, Lang, SavedVisitResponse } from '@smaran/shared';

/**
 * The visit in progress: the mentor's note, the draft and what they checked.
 * Kept in localStorage so a reload or a dead battery mid-visit doesn't lose the note.
 *
 * This is a synchronous store rather than React state: screens write to it and
 * navigate in the same tap, and the next screen must see the write on its first render.
 */
export interface VisitFlow {
  schoolId: string | null;
  note: string;
  lang: Lang;
  typing: boolean;
  draft: Draft | null;
  source: DraftSource | null;
  checks: Record<string, CheckedState>;
  saved: (SavedVisitResponse & { queued: boolean }) | null;
}

const EMPTY: VisitFlow = { schoolId: null, note: '', lang: 'en', typing: false, draft: null, source: null, checks: {}, saved: null };
const KEY = 'smaran.visitInProgress';

function load(): VisitFlow {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as VisitFlow) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

let state: VisitFlow = load();
const listeners = new Set<() => void>();

function set(next: VisitFlow) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: the note lives in memory only */
  }
  listeners.forEach((l) => l());
}

const api = {
  /** Starts a visit for a school, keeping an unfinished note for the same school. */
  begin(schoolId: string) {
    if (state.schoolId === schoolId && !state.saved) return;
    set({ ...EMPTY, lang: state.lang, schoolId });
  },
  update(patch: Partial<VisitFlow>) {
    set({ ...state, ...patch });
  },
  clear() {
    set({ ...EMPTY, lang: state.lang });
  },
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useFlow() {
  const flow = useSyncExternalStore(subscribe, () => state);
  return { flow, ...api };
}
