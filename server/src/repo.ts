import { randomUUID } from 'node:crypto';
import {
  addDays,
  classifySuggestion,
  daysBetween,
  plural,
  strengthThemes,
  withoutHonorific,
  THEME_BY_ID,
  type Block,
  type BlockOverview,
  type CaseloadResponse,
  type CheckedState,
  type Cluster,
  type Handover,
  type HandoverPreview,
  type HandoverRequest,
  type InboxItem,
  type MentorStats,
  type NewPersonRequest,
  type NewVisitRequest,
  type Pattern,
  type PatternsResponse,
  type Person,
  type PhotoRef,
  type Reminder,
  type ReminderStatus,
  type ResponseStatus,
  type Role,
  type RouteStop,
  type SavedVisitResponse,
  type School,
  type SchoolSummary,
  type Suggestion,
  type TeacherResponse,
  type User,
  type Visit,
} from '@smaran/shared';
import { hashPin } from './auth';
import { transaction, type DB } from './db/connection';

const ROUTE_LENGTH = 5;
export const OVERDUE_DAYS = 60;

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

/** A refusal the API reports to the person with a status code. */
export class RepoError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const toUser = (r: Row): User => ({
  id: String(r.id),
  name: String(r.name),
  firstName: String(r.first_name),
  role: r.role as Role,
  blockId: String(r.block_id),
  clusterId: str(r.cluster_id),
  schoolId: str(r.school_id),
  active: Number(r.active) === 1,
});

const toSchool = (r: Row): School => ({
  id: String(r.id),
  name: String(r.name),
  village: String(r.village),
  udise: String(r.udise),
  teacher: String(r.teacher),
  classLabel: String(r.class_label),
  subject: String(r.subject),
  clusterId: String(r.cluster_id),
  mentorId: str(r.mentor_id),
  mentorName: str(r.mentor_name),
});

const SCHOOL_SELECT = `SELECT s.*, m.name AS mentor_name FROM schools s LEFT JOIN users m ON m.id = s.mentor_id`;

export function createRepo(db: DB) {
  const q = {
    user: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByPhone: db.prepare('SELECT * FROM users WHERE phone = ?'),
    usersInBlock: db.prepare('SELECT * FROM users WHERE block_id = ? ORDER BY role, name'),
    activeCrpsInBlock: db.prepare("SELECT * FROM users WHERE block_id = ? AND role = 'crp' AND active = 1 ORDER BY name"),
    brcsInBlock: db.prepare("SELECT id FROM users WHERE block_id = ? AND role = 'brc' AND active = 1"),
    teachersAt: db.prepare("SELECT id FROM users WHERE school_id = ? AND role = 'teacher' AND active = 1"),
    block: db.prepare('SELECT * FROM blocks WHERE id = ?'),
    cluster: db.prepare('SELECT * FROM clusters WHERE id = ?'),
    clustersInBlock: db.prepare('SELECT * FROM clusters WHERE block_id = ? ORDER BY name'),
    school: db.prepare(`${SCHOOL_SELECT} WHERE s.id = ?`),
    schoolBlock: db.prepare('SELECT c.block_id FROM schools s JOIN clusters c ON c.id = s.cluster_id WHERE s.id = ?'),
    schoolsInCluster: db.prepare(`${SCHOOL_SELECT} WHERE s.cluster_id = ? ORDER BY s.name`),
    schoolsInBlock: db.prepare(`${SCHOOL_SELECT} WHERE s.cluster_id IN (SELECT id FROM clusters WHERE block_id = ?) ORDER BY s.name`),
    schoolsOfMentor: db.prepare(`${SCHOOL_SELECT} WHERE s.mentor_id = ? ORDER BY s.name`),
    visitsForSchool: db.prepare(
      `SELECT v.*, m.name AS mentor_name FROM visits v JOIN users m ON m.id = v.mentor_id
       WHERE v.school_id = ? ORDER BY v.date DESC, v.created_at DESC`,
    ),
    visitById: db.prepare('SELECT v.*, m.name AS mentor_name FROM visits v JOIN users m ON m.id = v.mentor_id WHERE v.id = ?'),
    visitByClientId: db.prepare('SELECT id, school_id FROM visits WHERE client_id = ?'),
    lastVisitBefore: db.prepare(
      `SELECT v.*, m.name AS mentor_name FROM visits v JOIN users m ON m.id = v.mentor_id
       WHERE v.school_id = ? AND v.date < ? ORDER BY v.date DESC, v.created_at DESC LIMIT 1`,
    ),
    latestVisit: db.prepare('SELECT id, date FROM visits WHERE school_id = ? ORDER BY date DESC, created_at DESC LIMIT 1'),
    visitOnDate: db.prepare('SELECT * FROM visits WHERE school_id = ? AND date = ? ORDER BY created_at DESC LIMIT 1'),
    suggestionsForVisit: db.prepare('SELECT * FROM suggestions WHERE visit_id = ? ORDER BY position'),
    suggestion: db.prepare('SELECT * FROM suggestions WHERE id = ?'),
    responsesFor: db.prepare(
      `SELECT r.*, u.name AS teacher_name FROM teacher_responses r JOIN users u ON u.id = r.teacher_id
       WHERE r.suggestion_id = ? ORDER BY r.created_at DESC`,
    ),
    insertResponse: db.prepare('INSERT INTO teacher_responses (id, suggestion_id, teacher_id, status, note) VALUES (?, ?, ?, ?, ?)'),
    photosForVisit: db.prepare('SELECT id, caption, taken_at FROM photos WHERE visit_id = ? ORDER BY taken_at'),
    photo: db.prepare('SELECT * FROM photos WHERE id = ?'),
    photoByClientId: db.prepare('SELECT * FROM photos WHERE client_id = ?'),
    insertPhoto: db.prepare(
      `INSERT INTO photos (id, client_id, school_id, visit_id, visit_client_id, uploaded_by, caption, mime, bytes, file, taken_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    linkPhotos: db.prepare('UPDATE photos SET visit_id = ? WHERE visit_client_id = ? AND visit_id IS NULL'),
    pendingCount: db.prepare("SELECT COUNT(*) AS n FROM suggestions WHERE visit_id = ? AND state = 'pending'"),
    countForVisit: db.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE visit_id = ?'),
    checkedInVisit: db.prepare('SELECT * FROM suggestions WHERE checked_in_visit = ? ORDER BY position'),
    routeStops: db.prepare('SELECT * FROM route_stops WHERE user_id = ? AND date = ? ORDER BY position'),
    insertStop: db.prepare('INSERT INTO route_stops (user_id, date, position, school_id) VALUES (?, ?, ?, ?)'),
    insertVisit: db.prepare(
      `INSERT INTO visits (id, client_id, school_id, mentor_id, date, time, summary, strength, note, lang, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertSuggestion: db.prepare('INSERT INTO suggestions (id, visit_id, school_id, position, text, how, theme) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    checkSuggestion: db.prepare(
      `UPDATE suggestions SET state = ?, checked_on = ?, checked_in_visit = ? WHERE id = ? AND school_id = ? AND state = 'pending'`,
    ),
    reminderSelect: `SELECT r.*, s.name AS school_name, c.name AS created_by_name, a.name AS assigned_to_name, x.name AS closed_by_name
       FROM reminders r JOIN schools s ON s.id = r.school_id JOIN users c ON c.id = r.created_by
       LEFT JOIN users a ON a.id = r.assigned_to LEFT JOIN users x ON x.id = r.closed_by`,
    reminderByClientId: db.prepare('SELECT id FROM reminders WHERE client_id = ?'),
    insertReminder: db.prepare(
      `INSERT INTO reminders (id, client_id, school_id, text, created_by, created_on, created_in_visit, assigned_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    closeReminder: db.prepare(
      `UPDATE reminders SET status = ?, closed_by = ?, closed_on = ?, closed_in_visit = ? WHERE id = ? AND school_id = ? AND status = 'open'`,
    ),
    openRemindersCount: db.prepare("SELECT COUNT(*) AS n FROM reminders WHERE school_id = ? AND status = 'open'"),
    insertNotification: db.prepare('INSERT INTO notifications (id, user_id, kind, title, body, link) VALUES (?, ?, ?, ?, ?, ?)'),
    inbox: db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100'),
    unread: db.prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL'),
    markRead: db.prepare("UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE user_id = ? AND id = ? AND read_at IS NULL"),
    markAllRead: db.prepare("UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE user_id = ? AND read_at IS NULL"),
    handoverSelect: `SELECT h.*, f.name AS from_name, t.name AS to_name, b.name AS by_name,
         (SELECT COUNT(*) FROM handover_schools hs WHERE hs.handover_id = h.id) AS school_count
       FROM handovers h JOIN users f ON f.id = h.from_user JOIN users t ON t.id = h.to_user JOIN users b ON b.id = h.done_by`,
    patternEdits: db.prepare('SELECT * FROM pattern_edits WHERE scope = ?'),
    upsertPatternEdit: db.prepare(
      `INSERT INTO pattern_edits (scope, theme, title, body, edited_by) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (scope, theme) DO UPDATE SET title = excluded.title, body = excluded.body,
         edited_by = excluded.edited_by, edited_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ),
  };
  const count = (sql: string, ...params: (string | number | null)[]) => (db.prepare(sql).get(...params) as { n: number }).n;

  // ── Mapping ──

  function toResponse(r: Row): TeacherResponse {
    return { id: String(r.id), status: r.status as ResponseStatus, note: String(r.note), createdAt: String(r.created_at), teacherName: String(r.teacher_name) };
  }

  function toSuggestion(r: Row): Suggestion {
    return {
      id: String(r.id),
      text: String(r.text),
      how: String(r.how ?? ''),
      state: r.state as Suggestion['state'],
      checkedOn: str(r.checked_on),
      note: str(r.note),
      responses: (q.responsesFor.all(String(r.id)) as Row[]).map(toResponse),
    };
  }

  function toVisit(r: Row): Visit {
    const photos: PhotoRef[] = (q.photosForVisit.all(String(r.id)) as Row[]).map((p) => ({
      id: String(p.id),
      caption: String(p.caption),
      takenAt: String(p.taken_at),
    }));
    return {
      id: String(r.id),
      schoolId: String(r.school_id),
      date: String(r.date),
      time: str(r.time),
      mentorId: String(r.mentor_id),
      mentorName: String(r.mentor_name),
      summary: String(r.summary),
      strength: String(r.strength),
      items: (q.suggestionsForVisit.all(String(r.id)) as Row[]).map(toSuggestion),
      photos,
    };
  }

  function toReminder(r: Row): Reminder {
    return {
      id: String(r.id),
      schoolId: String(r.school_id),
      schoolName: String(r.school_name),
      text: String(r.text),
      status: r.status as ReminderStatus,
      createdById: String(r.created_by),
      createdByName: String(r.created_by_name),
      createdOn: String(r.created_on),
      assignedToId: str(r.assigned_to),
      assignedToName: str(r.assigned_to_name),
      closedOn: str(r.closed_on),
      closedByName: str(r.closed_by_name),
    };
  }

  function toHandover(r: Row): Handover {
    return {
      id: String(r.id),
      date: String(r.date),
      fromId: String(r.from_user),
      fromName: String(r.from_name),
      toId: String(r.to_user),
      toName: String(r.to_name),
      byName: String(r.by_name),
      note: String(r.note),
      schoolCount: Number(r.school_count),
      reminderCount: Number(r.reminder_count),
    };
  }

  function summarize(s: School, today: string): SchoolSummary {
    const last = q.lastVisitBefore.get(s.id, today) as Row | undefined;
    const latest = q.latestVisit.get(s.id) as Row | undefined;
    const pending = (visitId: unknown) => (q.pendingCount.get(String(visitId)) as { n: number }).n;
    return {
      ...s,
      lastVisitDate: last ? String(last.date) : null,
      visitedToday: latest ? latest.date === today : false,
      toCheck: last ? pending(last.id) : 0,
      openCount: latest ? pending(latest.id) : 0,
      openReminders: (q.openRemindersCount.get(s.id) as { n: number }).n,
    };
  }

  function notify(userId: string | null | undefined, kind: InboxItem['kind'], title: string, body: string, link: string | null) {
    if (userId) q.insertNotification.run(randomUUID(), userId, kind, title, body.slice(0, 500), link);
  }

  const repo = {
    // ── People and places ──

    user(id: string): User | null {
      const r = q.user.get(id) as Row | undefined;
      return r ? toUser(r) : null;
    },

    userByPhone(phone: string): (User & { pinHash: string }) | null {
      const r = q.userByPhone.get(phone) as Row | undefined;
      return r ? { ...toUser(r), pinHash: String(r.pin_hash) } : null;
    },

    block(id: string): Block {
      const r = q.block.get(id) as Row;
      return { id: String(r.id), name: String(r.name), district: String(r.district) };
    },

    cluster(id: string | null): Cluster | null {
      if (!id) return null;
      const r = q.cluster.get(id) as Row | undefined;
      return r ? { id: String(r.id), name: String(r.name), blockId: String(r.block_id) } : null;
    },

    clusters(blockId: string): Cluster[] {
      return (q.clustersInBlock.all(blockId) as Row[]).map((r) => ({ id: String(r.id), name: String(r.name), blockId: String(r.block_id) }));
    },

    school(id: string): School | null {
      const r = q.school.get(id) as Row | undefined;
      return r ? toSchool(r) : null;
    },

    schoolBlockId(id: string): string | null {
      const r = q.schoolBlock.get(id) as Row | undefined;
      return r ? String(r.block_id) : null;
    },

    /** Schools a person can see: their own assignments first for a CRP, the whole block otherwise. */
    schools(scope: { blockId?: string; clusterId?: string; mentorId?: string }, today: string): SchoolSummary[] {
      const rows = scope.mentorId
        ? q.schoolsOfMentor.all(scope.mentorId)
        : scope.clusterId
          ? q.schoolsInCluster.all(scope.clusterId)
          : q.schoolsInBlock.all(scope.blockId!);
      return (rows as Row[]).map((r) => summarize(toSchool(r), today));
    },

    // ── Visits ──

    visits(schoolId: string): Visit[] {
      return (q.visitsForSchool.all(schoolId) as Row[]).map(toVisit);
    },

    lastVisitBefore(schoolId: string, date: string): Visit | null {
      const r = q.lastVisitBefore.get(schoolId, date) as Row | undefined;
      return r ? toVisit(r) : null;
    },

    visitedOn(schoolId: string, date: string): boolean {
      return q.visitOnDate.get(schoolId, date) !== undefined;
    },

    /** Today's route. When none is planned yet, plans one from the CRP's own schools, longest-waiting first. */
    route(user: User, date: string): RouteStop[] {
      let stops = q.routeStops.all(user.id, date) as Row[];
      if (stops.length === 0) {
        const candidates = repo
          .schools({ mentorId: user.id }, date)
          .sort((a, b) => (a.lastVisitDate ?? '').localeCompare(b.lastVisitDate ?? ''))
          .slice(0, ROUTE_LENGTH);
        if (candidates.length) {
          transaction(db, () => candidates.forEach((s, i) => q.insertStop.run(user.id, date, i + 1, s.id)));
          stops = q.routeStops.all(user.id, date) as Row[];
        }
      }
      return stops.map((stop) => {
        const school = repo.school(String(stop.school_id))!;
        const v = q.visitOnDate.get(school.id, date) as Row | undefined;
        return {
          position: Number(stop.position),
          school: summarize(school, date),
          visit: v
            ? {
                time: str(v.time),
                savedCount: (q.countForVisit.get(String(v.id)) as { n: number }).n,
                checkedCount: (q.checkedInVisit.all(String(v.id)) as Row[]).length,
              }
            : null,
        };
      });
    },

    routePosition(userId: string, date: string, schoolId: string): { position: number; total: number } | null {
      const stops = q.routeStops.all(userId, date) as Row[];
      const i = stops.findIndex((s) => s.school_id === schoolId);
      return i < 0 ? null : { position: Number(stops[i].position), total: stops.length };
    },

    /** Saves a visit with its reminders and photo links. Safe to call twice with the same clientId. */
    createVisit(user: User, req: NewVisitRequest): SavedVisitResponse & { created: boolean } {
      const existing = q.visitByClientId.get(req.clientId) as Row | undefined;
      if (existing) return { ...repo.savedVisit(String(existing.id)), created: false };
      const school = repo.school(req.schoolId)!;

      const visitId = randomUUID();
      const actions = req.draft.actions
        .map((a) => ({ do: a.do.trim().replace(/[.।]$/, ''), how: a.how.trim() }))
        .filter((a) => a.do);
      const summary = req.draft.summary.trim() || actions.map((a) => a.do).join('; ');
      let remindersAdded = 0;
      let remindersClosed = 0;

      transaction(db, () => {
        q.insertVisit.run(visitId, req.clientId, req.schoolId, user.id, req.date, req.time, summary, req.draft.strength.trim(), req.note, req.lang, req.source);
        for (const [id, state] of Object.entries(req.checks)) q.checkSuggestion.run(state, req.date, visitId, id, req.schoolId);
        actions.forEach((a, i) => {
          q.insertSuggestion.run(randomUUID(), visitId, req.schoolId, i + 1, a.do, a.how, classifySuggestion(`${a.do} ${a.how}`));
        });
        for (const [id, status] of Object.entries(req.reminderUpdates)) {
          remindersClosed += Number(q.closeReminder.run(status, user.id, req.date, visitId, id, req.schoolId).changes);
        }
        for (const r of req.reminders) {
          if (!r.text.trim() || q.reminderByClientId.get(r.clientId)) continue;
          q.insertReminder.run(randomUUID(), r.clientId, req.schoolId, r.text.trim(), user.id, req.date, visitId, school.mentorId ?? user.id);
          remindersAdded++;
        }
        q.linkPhotos.run(visitId, req.clientId);

        for (const t of q.teachersAt.all(req.schoolId) as Row[]) {
          notify(String(t.id), 'feedback', `New feedback from ${user.name}`, summary, '/');
        }
        if (school.mentorId && school.mentorId !== user.id) {
          notify(school.mentorId, 'feedback', `${user.name} visited ${school.name}`, summary, `/schools/${school.id}`);
        }
      });
      return { ...repo.savedVisit(visitId), remindersAdded, remindersClosed, created: true };
    },

    savedVisit(visitId: string): SavedVisitResponse {
      const visit = toVisit(q.visitById.get(visitId) as Row);
      const closed = (q.checkedInVisit.all(visitId) as Row[]).map((r) => ({ id: String(r.id), text: String(r.text), state: r.state as CheckedState }));
      const remindersAdded = count('SELECT COUNT(*) AS n FROM reminders WHERE created_in_visit = ?', visitId);
      const remindersClosed = count('SELECT COUNT(*) AS n FROM reminders WHERE closed_in_visit = ?', visitId);
      return { visit, closed, remindersAdded, remindersClosed };
    },

    // ── Teacher responses ──

    suggestionSchool(suggestionId: string): string | null {
      const r = q.suggestion.get(suggestionId) as Row | undefined;
      return r ? String(r.school_id) : null;
    },

    addResponse(teacher: User, suggestionId: string, status: ResponseStatus, note: string): TeacherResponse {
      const s = q.suggestion.get(suggestionId) as Row | undefined;
      if (!s || s.school_id !== teacher.schoolId) throw new RepoError(404, 'That suggestion isn’t for your school.');
      const id = randomUUID();
      q.insertResponse.run(id, suggestionId, teacher.id, status, note.trim());
      const school = repo.school(String(s.school_id))!;
      const verb = status === 'help' ? 'needs help' : status === 'done' ? 'has done a suggestion' : 'is trying a suggestion';
      notify(school.mentorId, 'response', `${teacher.name} ${verb} at ${school.name}`, note.trim() || String(s.text), `/visit/${school.id}`);
      return toResponse(q.responsesFor.get(suggestionId) as Row);
    },

    teacherHome(teacher: User) {
      const school = repo.school(teacher.schoolId!)!;
      return { school, visits: repo.visits(school.id) };
    },

    // ── Reminders ──

    reminders(filter: { schoolId?: string; assignedTo?: string; openOnly?: boolean }): Reminder[] {
      const where: string[] = [];
      const params: string[] = [];
      if (filter.schoolId) (where.push('r.school_id = ?'), params.push(filter.schoolId));
      if (filter.assignedTo) (where.push('r.assigned_to = ?'), params.push(filter.assignedTo));
      if (filter.openOnly) where.push("r.status = 'open'");
      const sql = `${q.reminderSelect}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY r.status = 'open' DESC, r.created_on DESC`;
      return (db.prepare(sql).all(...params) as Row[]).map(toReminder);
    },

    addReminder(user: User, schoolId: string, text: string, clientId: string, date: string): Reminder {
      const existing = q.reminderByClientId.get(clientId) as Row | undefined;
      const school = repo.school(schoolId)!;
      if (!existing) {
        q.insertReminder.run(randomUUID(), clientId, schoolId, text.trim(), user.id, date, null, school.mentorId ?? user.id);
        if (school.mentorId && school.mentorId !== user.id) {
          notify(school.mentorId, 'reminder', `${user.name} added a reminder for ${school.name}`, text.trim(), `/visit/${schoolId}`);
        }
      }
      const id = String((q.reminderByClientId.get(clientId) as Row).id);
      return toReminder(db.prepare(`${q.reminderSelect} WHERE r.id = ?`).get(id) as Row);
    },

    closeReminder(user: User, reminderId: string, status: Exclude<ReminderStatus, 'open'>, date: string) {
      const r = db.prepare('SELECT school_id FROM reminders WHERE id = ?').get(reminderId) as Row | undefined;
      if (!r) throw new RepoError(404, 'No reminder with that id.');
      q.closeReminder.run(status, user.id, date, null, reminderId, String(r.school_id));
    },

    reminderSchool(reminderId: string): string | null {
      const r = db.prepare('SELECT school_id FROM reminders WHERE id = ?').get(reminderId) as Row | undefined;
      return r ? String(r.school_id) : null;
    },

    // ── Photos ──

    addPhoto(p: { clientId: string; schoolId: string; visitClientId: string | null; user: User; caption: string; mime: string; bytes: number; file: string; takenAt: string }): PhotoRef {
      const existing = q.photoByClientId.get(p.clientId) as Row | undefined;
      if (existing) return { id: String(existing.id), caption: String(existing.caption), takenAt: String(existing.taken_at) };
      const visit = p.visitClientId ? (q.visitByClientId.get(p.visitClientId) as Row | undefined) : undefined;
      const id = p.file.replace(/\.\w+$/, '');
      q.insertPhoto.run(id, p.clientId, p.schoolId, visit ? String(visit.id) : null, p.visitClientId, p.user.id, p.caption.trim(), p.mime, p.bytes, p.file, p.takenAt);
      return { id, caption: p.caption.trim(), takenAt: p.takenAt };
    },

    photoExists(clientId: string): boolean {
      return q.photoByClientId.get(clientId) !== undefined;
    },

    photo(id: string): { file: string; mime: string; schoolId: string } | null {
      const r = q.photo.get(id) as Row | undefined;
      return r ? { file: String(r.file), mime: String(r.mime), schoolId: String(r.school_id) } : null;
    },

    // ── Handovers and assignments ──

    handovers(filter: { schoolId?: string; userId?: string; blockId?: string }, limit = 20): Handover[] {
      let sql = q.handoverSelect;
      const params: string[] = [];
      if (filter.schoolId) (sql += ' WHERE h.id IN (SELECT handover_id FROM handover_schools WHERE school_id = ?)'), params.push(filter.schoolId);
      else if (filter.userId) (sql += ' WHERE h.from_user = ? OR h.to_user = ?'), params.push(filter.userId, filter.userId);
      else if (filter.blockId) (sql += ' WHERE f.block_id = ?'), params.push(filter.blockId);
      sql += ` ORDER BY h.created_at DESC LIMIT ${limit}`;
      return (db.prepare(sql).all(...params) as Row[]).map(toHandover);
    },

    handoverPreview(from: User): HandoverPreview {
      const schools = (q.schoolsOfMentor.all(from.id) as Row[]).map((r) => ({ id: String(r.id), name: String(r.name) }));
      const pendingFollowUps = schools.reduce((n, s) => {
        const latest = q.latestVisit.get(s.id) as Row | undefined;
        return n + (latest ? (q.pendingCount.get(String(latest.id)) as { n: number }).n : 0);
      }, 0);
      return {
        from,
        schools,
        openReminders: count("SELECT COUNT(*) AS n FROM reminders WHERE assigned_to = ? AND status = 'open'", from.id),
        pendingFollowUps,
        candidates: (q.activeCrpsInBlock.all(from.blockId) as Row[]).map(toUser).filter((u) => u.id !== from.id),
      };
    },

    /**
     * Moves a CRP's schools and open reminders to a colleague, optionally changing
     * the outgoing person's role at the same time. History stays with the schools.
     */
    handover(by: User, req: HandoverRequest, today: string): Handover {
      const from = repo.user(req.fromUserId);
      const to = repo.user(req.toUserId);
      if (!from || from.blockId !== by.blockId) throw new RepoError(404, 'No such person in your block.');
      if (!to || to.blockId !== by.blockId || to.role !== 'crp' || !to.active) throw new RepoError(400, 'Choose an active CRP in your block to take over.');
      if (from.id === to.id) throw new RepoError(400, 'Choose someone other than the person handing over.');
      if (by.role !== 'brc' && by.id !== from.id) throw new RepoError(403, 'Only the block coordinator can hand over someone else’s schools.');
      if (req.newRole && by.role !== 'brc') throw new RepoError(403, 'Only the block coordinator can change a role.');

      const id = randomUUID();
      transaction(db, () => {
        const schoolIds = (q.schoolsOfMentor.all(from.id) as Row[]).map((r) => String(r.id));
        db.prepare('UPDATE schools SET mentor_id = ? WHERE mentor_id = ?').run(to.id, from.id);
        const moved = Number(db.prepare("UPDATE reminders SET assigned_to = ? WHERE assigned_to = ? AND status = 'open'").run(to.id, from.id).changes);
        db.prepare('DELETE FROM route_stops WHERE user_id = ? AND date >= ?').run(from.id, today);
        db.prepare('INSERT INTO handovers (id, from_user, to_user, done_by, note, reminder_count, date) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(id, from.id, to.id, by.id, req.note.trim(), moved, today);
        const link = db.prepare('INSERT INTO handover_schools (handover_id, school_id) VALUES (?, ?)');
        for (const s of schoolIds) link.run(id, s);

        if (req.newRole === 'inactive') db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(from.id);
        else if (req.newRole && req.newRole !== from.role) {
          db.prepare('UPDATE users SET role = ?, cluster_id = CASE WHEN ? = \'crp\' THEN cluster_id ELSE NULL END WHERE id = ?').run(req.newRole, req.newRole, from.id);
        }

        const what = `${plural(schoolIds.length, 'school')} and ${plural(moved, 'open reminder')}`;
        notify(to.id, 'handover', `${from.name} handed over ${plural(schoolIds.length, 'school')} to you`, req.note.trim() || `${what} are now yours.`, '/schools');
        if (by.id !== from.id) notify(from.id, 'handover', `Your schools were handed over to ${to.name}`, `${what} moved.`, '/');
        for (const b of q.brcsInBlock.all(by.blockId) as Row[]) {
          if (String(b.id) !== by.id) notify(String(b.id), 'handover', `Handover recorded: ${from.name} to ${to.name}`, `${what} moved.`, '/people');
        }
      });
      return repo.handovers({ userId: from.id }, 1)[0];
    },

    reassignSchool(by: User, schoolId: string, mentorId: string | null) {
      const school = repo.school(schoolId);
      if (!school || repo.schoolBlockId(schoolId) !== by.blockId) throw new RepoError(404, 'No such school in your block.');
      const mentor = mentorId ? repo.user(mentorId) : null;
      if (mentorId && (!mentor || mentor.role !== 'crp' || !mentor.active || mentor.blockId !== by.blockId)) {
        throw new RepoError(400, 'Choose an active CRP in your block.');
      }
      transaction(db, () => {
        db.prepare('UPDATE schools SET mentor_id = ? WHERE id = ?').run(mentorId, schoolId);
        if (mentorId) {
          db.prepare("UPDATE reminders SET assigned_to = ? WHERE school_id = ? AND status = 'open'").run(mentorId, schoolId);
          notify(mentorId, 'assignment', `${school.name} is now one of your schools`, `Assigned by ${by.name}.`, `/visit/${schoolId}`);
        }
        if (school.mentorId && school.mentorId !== mentorId) {
          notify(school.mentorId, 'assignment', `${school.name} has moved to ${mentor?.name ?? 'no one yet'}`, `Changed by ${by.name}.`, '/schools');
        }
      });
    },

    // ── Block view ──

    blockOverview(blockId: string, today: string): BlockOverview {
      const cutoff30 = addDays(today, -30);
      const schools = repo.schools({ blockId }, today);
      const lastVisit = (s: SchoolSummary) => (s.visitedToday ? today : s.lastVisitDate);
      const isOverdue = (s: SchoolSummary) => {
        const d = lastVisit(s);
        return !d || daysBetween(d, today) > OVERDUE_DAYS;
      };
      const clusters = repo.clusters(blockId);

      const mentors: MentorStats[] = (q.activeCrpsInBlock.all(blockId) as Row[]).map(toUser).map((u) => {
        const mine = schools.filter((s) => s.mentorId === u.id);
        const checked = db
          .prepare(
            `SELECT sg.state FROM suggestions sg JOIN visits v ON v.id = sg.visit_id WHERE v.mentor_id = ? AND sg.state != 'pending'`,
          )
          .all(u.id) as Row[];
        const followed = checked.filter((r) => r.state === 'done' || r.state === 'partly').length;
        const last = db.prepare('SELECT MAX(date) AS d FROM visits WHERE mentor_id = ?').get(u.id) as Row;
        return {
          user: u,
          clusterName: clusters.find((c) => c.id === u.clusterId)?.name ?? null,
          schools: mine.length,
          visited30: count('SELECT COUNT(DISTINCT school_id) AS n FROM visits WHERE mentor_id = ? AND date > ?', u.id, cutoff30),
          overdue: mine.filter(isOverdue).length,
          followThrough: checked.length ? Math.round((followed / checked.length) * 100) : null,
          openReminders: count("SELECT COUNT(*) AS n FROM reminders WHERE assigned_to = ? AND status = 'open'", u.id),
          lastVisit: str(last.d),
        };
      });

      const overdue = schools
        .filter(isOverdue)
        .map((s) => ({ school: s, days: lastVisit(s) ? daysBetween(lastVisit(s)!, today) : null }))
        .sort((a, b) => (b.days ?? 9999) - (a.days ?? 9999));

      return {
        block: repo.block(blockId),
        clusters,
        mentors,
        overdue,
        overdueDays: OVERDUE_DAYS,
        unassigned: schools.filter((s) => !s.mentorId),
        recentHandovers: repo.handovers({ blockId }, 5),
      };
    },

    caseload(user: User, today: string): CaseloadResponse {
      return {
        user,
        cluster: repo.cluster(user.clusterId),
        schools: repo.schools({ mentorId: user.id }, today),
        handovers: repo.handovers({ userId: user.id }),
        colleagues: (q.activeCrpsInBlock.all(user.blockId) as Row[]).map(toUser).filter((u) => u.id !== user.id),
      };
    },

    people(blockId: string): Person[] {
      return (q.usersInBlock.all(blockId) as Row[]).map((r) => ({
        ...toUser(r),
        phone: String(r.phone),
        schoolCount: count('SELECT COUNT(*) AS n FROM schools WHERE mentor_id = ?', String(r.id)),
      }));
    },

    addPerson(by: User, req: NewPersonRequest): User {
      if (repo.userByPhone(req.phone)) throw new RepoError(409, 'Someone is already registered with that mobile number.');
      if (req.role === 'crp' && (!req.clusterId || repo.cluster(req.clusterId)?.blockId !== by.blockId)) {
        throw new RepoError(400, 'Choose the cluster this CRP will work in.');
      }
      if (req.role === 'teacher' && (!req.schoolId || repo.schoolBlockId(req.schoolId) !== by.blockId)) {
        throw new RepoError(400, 'Choose the teacher’s school.');
      }
      const id = randomUUID();
      const name = req.name.trim();
      db.prepare('INSERT INTO users (id, name, first_name, role, phone, pin_hash, block_id, cluster_id, school_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        id, name, withoutHonorific(name).split(' ')[0], req.role, req.phone, hashPin(req.pin), by.blockId,
        req.role === 'crp' ? req.clusterId! : null, req.role === 'teacher' ? req.schoolId! : null,
      );
      return repo.user(id)!;
    },

    /** Changes a role or deactivates someone. A CRP with schools must hand them over first. */
    updatePerson(by: User, id: string, patch: { role?: Role; active?: boolean; clusterId?: string | null }): User {
      const person = repo.user(id);
      if (!person || person.blockId !== by.blockId) throw new RepoError(404, 'No such person in your block.');
      const leavingCrp = person.role === 'crp' && ((patch.role && patch.role !== 'crp') || patch.active === false);
      const schools = count('SELECT COUNT(*) AS n FROM schools WHERE mentor_id = ?', id);
      if (leavingCrp && schools > 0) {
        throw new RepoError(409, `${person.name} still has ${plural(schools, 'school')}. Hand them over first, then change the role.`);
      }
      if (patch.role) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(patch.role, id);
      if (patch.active !== undefined) db.prepare('UPDATE users SET active = ? WHERE id = ?').run(patch.active ? 1 : 0, id);
      if (patch.clusterId !== undefined) db.prepare('UPDATE users SET cluster_id = ? WHERE id = ?').run(patch.clusterId, id);
      return repo.user(id)!;
    },

    // ── Inbox ──

    inbox(userId: string): InboxItem[] {
      return (q.inbox.all(userId) as Row[]).map((r) => ({
        id: String(r.id),
        kind: r.kind as InboxItem['kind'],
        title: String(r.title),
        body: String(r.body),
        link: str(r.link),
        createdAt: String(r.created_at),
        read: r.read_at !== null,
      }));
    },

    unreadCount(userId: string): number {
      return (q.unread.get(userId) as { n: number }).n;
    },

    markRead(userId: string, id?: string) {
      if (id) q.markRead.run(userId, id);
      else q.markAllRead.run(userId);
    },

    // ── Patterns ──

    /**
     * Themes that recur across a cluster's or block's schools in the last
     * `periodDays`, compared with the period before.
     */
    patterns(scope: { kind: 'cluster' | 'block'; id: string }, date: string, periodDays = 60): PatternsResponse {
      const inScope = scope.kind === 'cluster' ? 's.cluster_id = ?' : 's.cluster_id IN (SELECT id FROM clusters WHERE block_id = ?)';
      const schools = (db.prepare(`SELECT s.id, s.name FROM schools s WHERE ${inScope} ORDER BY s.name`).all(scope.id) as Row[]).map((r) => ({
        id: String(r.id),
        name: String(r.name),
      }));
      const themesBetween = db.prepare(
        `SELECT sg.theme, v.school_id FROM suggestions sg JOIN visits v ON v.id = sg.visit_id JOIN schools s ON s.id = v.school_id
         WHERE ${inScope} AND v.date > ? AND v.date <= ? AND sg.theme IS NOT NULL`,
      );
      const visitsBetween = db.prepare(`SELECT v.* FROM visits v JOIN schools s ON s.id = v.school_id WHERE ${inScope} AND v.date > ? AND v.date <= ?`);
      const start = addDays(date, -periodDays);
      const prevStart = addDays(date, -2 * periodDays);

      const collect = (from: string, to: string) => {
        const byTheme = new Map<string, Set<string>>();
        const add = (theme: string, schoolId: string) => {
          if (!byTheme.has(theme)) byTheme.set(theme, new Set());
          byTheme.get(theme)!.add(schoolId);
        };
        for (const r of themesBetween.all(scope.id, from, to) as Row[]) add(String(r.theme), String(r.school_id));
        const visits = visitsBetween.all(scope.id, from, to) as Row[];
        for (const v of visits) for (const t of strengthThemes(String(v.strength))) add(t, String(v.school_id));
        return { byTheme, visitCount: visits.length };
      };

      const now = collect(start, date);
      const before = collect(prevStart, start);
      const scopeKey = `${scope.kind}:${scope.id}`;
      const edits = new Map((q.patternEdits.all(scopeKey) as Row[]).map((r) => [String(r.theme), r]));

      const patterns: Pattern[] = [];
      for (const [theme, ids] of now.byTheme) {
        const def = THEME_BY_ID[theme];
        if (!def || ids.size < 2) continue;
        const prev = before.byTheme.get(theme)?.size ?? 0;
        const edit = edits.get(theme);
        patterns.push({
          theme,
          kind: def.kind,
          title: edit ? String(edit.title) : def.pattern.title,
          body: edit ? String(edit.body) : def.pattern.body,
          schoolIds: schools.filter((s) => ids.has(s.id)).map((s) => s.id),
          count: ids.size,
          previousCount: prev,
          trend: trendText(ids.size, prev),
          edited: Boolean(edit),
        });
      }
      patterns.sort((a, b) => (a.kind === b.kind ? b.count - a.count : a.kind === 'concern' ? -1 : 1));
      const name = scope.kind === 'cluster' ? repo.cluster(scope.id)!.name : `${repo.block(scope.id).name} block`;
      const blockId = scope.kind === 'cluster' ? repo.cluster(scope.id)!.blockId : scope.id;
      return { scope: { ...scope, name }, clusters: repo.clusters(blockId), periodDays, schools, visitCount: now.visitCount, patterns };
    },

    editPattern(scope: { kind: 'cluster' | 'block'; id: string }, theme: string, title: string, body: string, userId: string) {
      q.upsertPatternEdit.run(`${scope.kind}:${scope.id}`, theme, title, body, userId);
    },
  };
  return repo;
}

function trendText(now: number, prev: number): string {
  if (prev === 0) return 'New in this period';
  if (now > prev) return `Up from ${prev} ${prev === 1 ? 'school' : 'schools'}`;
  if (now < prev) return `Down from ${prev} ${prev === 1 ? 'school' : 'schools'}`;
  return 'Same as the period before';
}

export type Repo = ReturnType<typeof createRepo>;
