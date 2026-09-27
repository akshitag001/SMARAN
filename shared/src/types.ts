/** Language the mentor speaks in, and the language feedback is written in. */
export type Lang = 'en' | 'hi';

/** A suggestion starts `pending` and is checked at the next visit. */
export type ItemState = 'pending' | 'done' | 'partly' | 'notyet';
export type CheckedState = Exclude<ItemState, 'pending'>;

/** Where the feedback draft came from. */
export type DraftSource = 'ai' | 'local' | 'offline' | 'self';

export interface Cluster {
  id: string;
  name: string;
  block: string;
  district: string;
}

export interface Mentor {
  id: string;
  name: string;
  firstName: string;
  role: string;
  clusterId: string;
}

export interface School {
  id: string;
  name: string;
  village: string;
  udise: string;
  teacher: string;
  classLabel: string;
  subject: string;
}

export interface SchoolSummary extends School {
  /** Latest visit before today. */
  lastVisitDate: string | null;
  visitedToday: boolean;
  /** Suggestions from the last visit before today, still waiting to be checked. */
  toCheck: number;
  /** Suggestions from the most recent visit (today's included) still open. */
  openCount: number;
}

export interface Suggestion {
  id: string;
  text: string;
  how: string;
  state: ItemState;
  checkedOn: string | null;
  /** How it was checked, when not at a visit (e.g. "Reported at the cluster meeting"). */
  note: string | null;
}

export interface Visit {
  id: string;
  schoolId: string;
  date: string;
  time: string | null;
  mentorId: string;
  mentorName: string;
  summary: string;
  strength: string;
  items: Suggestion[];
  /** True for a visit held only on this phone, waiting to sync. */
  unsynced?: boolean;
}

export interface RouteStop {
  position: number;
  school: SchoolSummary;
  visit: { time: string | null; savedCount: number; checkedCount: number } | null;
}

export interface TodayResponse {
  date: string;
  mentor: Mentor;
  cluster: Cluster;
  stops: RouteStop[];
}

export interface BriefResponse {
  school: School;
  lastVisit: Visit | null;
  visitCount: number;
  stop: { position: number; total: number } | null;
  visitedToday: boolean;
}

export interface HistoryResponse {
  school: School;
  visits: Visit[];
}

export interface DraftAction {
  do: string;
  how: string;
}

export interface Draft {
  strength: string;
  actions: DraftAction[];
  summary: string;
}

export interface DraftRequest {
  schoolId: string;
  note: string;
  lang: Lang;
  /** What the mentor saw today for last visit's suggestions, by suggestion id. */
  checks: Record<string, CheckedState>;
}

export interface DraftResponse {
  draft: Draft;
  source: DraftSource;
}

export interface NewVisitRequest {
  /** Generated on the phone so a visit synced twice is saved once. */
  clientId: string;
  schoolId: string;
  date: string;
  time: string;
  note: string;
  lang: Lang;
  source: DraftSource;
  draft: Draft;
  checks: Record<string, CheckedState>;
}

export interface SavedVisitResponse {
  visit: Visit;
  closed: { id: string; text: string; state: CheckedState }[];
}

export interface Pattern {
  theme: string;
  kind: 'concern' | 'strength';
  title: string;
  body: string;
  schoolIds: string[];
  count: number;
  previousCount: number;
  trend: string;
  edited: boolean;
}

export interface PatternsResponse {
  cluster: Cluster;
  periodDays: number;
  schools: { id: string; name: string }[];
  visitCount: number;
  patterns: Pattern[];
}

export interface LoginResponse {
  token: string;
  mentor: Mentor;
  cluster: Cluster;
}
