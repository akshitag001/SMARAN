/** Language the mentor speaks in, and the language feedback is written in. */
export type Lang = 'en' | 'hi';

/**
 * crp: Cluster Resource Person, visits schools and gives feedback.
 * brc: Block Resource Coordinator, oversees the CRPs and schools of a block.
 * teacher: receives feedback and says what they tried.
 */
export type Role = 'crp' | 'brc' | 'teacher';

/** A suggestion starts `pending` and is checked at the next visit. */
export type ItemState = 'pending' | 'done' | 'partly' | 'notyet';
export type CheckedState = Exclude<ItemState, 'pending'>;

/** Where the feedback draft came from. */
export type DraftSource = 'ai' | 'local' | 'offline' | 'self';

/** What a teacher says about a suggestion between visits. */
export type ResponseStatus = 'trying' | 'done' | 'help';

export type ReminderStatus = 'open' | 'done' | 'dropped';

export interface Block {
  id: string;
  name: string;
  district: string;
}

export interface Cluster {
  id: string;
  name: string;
  blockId: string;
}

export interface User {
  id: string;
  name: string;
  firstName: string;
  role: Role;
  blockId: string;
  clusterId: string | null;
  /** For teachers: their school. */
  schoolId: string | null;
  active: boolean;
}

export interface School {
  id: string;
  name: string;
  village: string;
  udise: string;
  teacher: string;
  classLabel: string;
  subject: string;
  clusterId: string;
  mentorId: string | null;
  mentorName: string | null;
}

export interface SchoolSummary extends School {
  /** Latest visit before today. */
  lastVisitDate: string | null;
  visitedToday: boolean;
  /** Suggestions from the last visit before today, still waiting to be checked. */
  toCheck: number;
  /** Suggestions from the most recent visit (today's included) still open. */
  openCount: number;
  openReminders: number;
}

export interface TeacherResponse {
  id: string;
  status: ResponseStatus;
  note: string;
  createdAt: string;
  teacherName: string;
}

export interface Suggestion {
  id: string;
  text: string;
  how: string;
  state: ItemState;
  checkedOn: string | null;
  /** How it was checked, when not at a visit (e.g. "Reported at the cluster meeting"). */
  note: string | null;
  /** Newest first. */
  responses: TeacherResponse[];
}

export interface PhotoRef {
  id: string;
  caption: string;
  takenAt: string;
  /** True while the photo is only on this phone. */
  local?: boolean;
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
  photos: PhotoRef[];
  /** True for a visit held only on this phone, waiting to sync. */
  unsynced?: boolean;
}

export interface Reminder {
  id: string;
  schoolId: string;
  schoolName: string;
  text: string;
  status: ReminderStatus;
  createdById: string;
  createdByName: string;
  createdOn: string;
  assignedToId: string | null;
  assignedToName: string | null;
  closedOn: string | null;
  closedByName: string | null;
}

export interface Handover {
  id: string;
  date: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  byName: string;
  note: string;
  schoolCount: number;
  reminderCount: number;
}

export interface RouteStop {
  position: number;
  school: SchoolSummary;
  visit: { time: string | null; savedCount: number; checkedCount: number } | null;
}

export interface TodayResponse {
  date: string;
  user: User;
  cluster: Cluster | null;
  stops: RouteStop[];
  /** Open reminders assigned to this CRP across all their schools. */
  reminders: Reminder[];
}

export interface BriefResponse {
  school: School;
  lastVisit: Visit | null;
  visitCount: number;
  stop: { position: number; total: number } | null;
  visitedToday: boolean;
  reminders: Reminder[];
  /** The latest handover that brought this school to its current CRP. */
  handover: Handover | null;
}

export interface HistoryResponse {
  school: School;
  visits: Visit[];
  reminders: Reminder[];
  handovers: Handover[];
}

export interface DraftAction {
  do: string;
  how: string;
}

export interface Draft {
  strength: string;
  actions: DraftAction[];
  summary: string;
  /** Things the mentor said to check next time, pulled from the note. */
  reminders: string[];
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

export interface NewReminder {
  clientId: string;
  text: string;
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
  draft: Omit<Draft, 'reminders'>;
  checks: Record<string, CheckedState>;
  reminders: NewReminder[];
  /** Open reminders dealt with at this visit. */
  reminderUpdates: Record<string, Exclude<ReminderStatus, 'open'>>;
  /** Photos taken at this visit; they upload separately and are linked by these ids. */
  photoClientIds: string[];
}

export interface SavedVisitResponse {
  visit: Visit;
  closed: { id: string; text: string; state: CheckedState }[];
  remindersAdded: number;
  remindersClosed: number;
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
  scope: { kind: 'cluster' | 'block'; id: string; name: string };
  clusters: Cluster[];
  periodDays: number;
  schools: { id: string; name: string }[];
  visitCount: number;
  patterns: Pattern[];
}

export interface Session {
  token: string;
  user: User;
  block: Block;
  cluster: Cluster | null;
  school: School | null;
}

export type LoginResponse = Session;

export interface InboxItem {
  id: string;
  kind: 'feedback' | 'response' | 'handover' | 'reminder' | 'assignment';
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export interface MentorStats {
  user: User;
  clusterName: string | null;
  schools: number;
  visited30: number;
  overdue: number;
  /** Share of checked suggestions that were done or partly done, 0 to 100. */
  followThrough: number | null;
  openReminders: number;
  lastVisit: string | null;
}

export interface BlockOverview {
  block: Block;
  clusters: Cluster[];
  mentors: MentorStats[];
  /** Schools with no visit in `overdueDays`, or never visited. */
  overdue: { school: SchoolSummary; days: number | null }[];
  overdueDays: number;
  unassigned: SchoolSummary[];
  recentHandovers: Handover[];
}

export interface CaseloadResponse {
  user: User;
  cluster: Cluster | null;
  schools: SchoolSummary[];
  handovers: Handover[];
  /** Other CRPs in the block a school or caseload can move to. */
  colleagues: User[];
}

export interface HandoverPreview {
  from: User;
  schools: { id: string; name: string }[];
  openReminders: number;
  pendingFollowUps: number;
  candidates: User[];
}

export interface HandoverRequest {
  fromUserId: string;
  toUserId: string;
  note: string;
  /** Optionally change the outgoing person's role at the same time, or deactivate them. */
  newRole?: Role | 'inactive';
}

export interface Person extends User {
  phone: string;
  schoolCount: number;
}

export interface PeopleResponse {
  people: Person[];
  clusters: Cluster[];
  schools: { id: string; name: string; clusterId: string }[];
}

export interface NewPersonRequest {
  name: string;
  phone: string;
  pin: string;
  role: Role;
  clusterId?: string | null;
  schoolId?: string | null;
}

export interface TeacherHomeResponse {
  school: School;
  visits: Visit[];
}
