import { randomUUID } from 'node:crypto';
import {
  addDays,
  classifySuggestion,
  strengthThemes,
  THEME_BY_ID,
  type CheckedState,
  type Cluster,
  type Mentor,
  type NewVisitRequest,
  type Pattern,
  type PatternsResponse,
  type RouteStop,
  type SavedVisitResponse,
  type School,
  type SchoolSummary,
  type Suggestion,
  type Visit,
} from '@smaran/shared';
import { transaction, type DB } from './db/connection';

const ROUTE_LENGTH = 5;

type Row = Record<string, unknown>;

const toMentor = (r: Row): Mentor => ({
  id: String(r.id),
  name: String(r.name),
  firstName: String(r.first_name),
  role: String(r.role),
  clusterId: String(r.cluster_id),
});

const toSchool = (r: Row): School => ({
  id: String(r.id),
  name: String(r.name),
  village: String(r.village),
  udise: String(r.udise),
  teacher: String(r.teacher),
  classLabel: String(r.class_label),
  subject: String(r.subject),
});

const toSuggestion = (r: Row): Suggestion => ({
  id: String(r.id),
  text: String(r.text),
  how: String(r.how ?? ''),
  state: r.state as Suggestion['state'],
  checkedOn: (r.checked_on as string | null) ?? null,
  note: (r.note as string | null) ?? null,
});

export function createRepo(db: DB) {
  const q = {
    mentor: db.prepare('SELECT * FROM mentors WHERE id = ?'),
    mentorByPhone: db.prepare('SELECT * FROM mentors WHERE phone = ?'),
    cluster: db.prepare('SELECT * FROM clusters WHERE id = ?'),
    school: db.prepare('SELECT * FROM schools WHERE id = ?'),
    schoolsInCluster: db.prepare('SELECT * FROM schools WHERE cluster_id = ? ORDER BY name'),
    visitsForSchool: db.prepare(
      `SELECT v.*, m.name AS mentor_name FROM visits v JOIN mentors m ON m.id = v.mentor_id
       WHERE v.school_id = ? ORDER BY v.date DESC, v.created_at DESC`,
    ),
    visitById: db.prepare(
      'SELECT v.*, m.name AS mentor_name FROM visits v JOIN mentors m ON m.id = v.mentor_id WHERE v.id = ?',
    ),
    visitByClientId: db.prepare('SELECT id FROM visits WHERE client_id = ?'),
    lastVisitBefore: db.prepare(
      `SELECT v.*, m.name AS mentor_name FROM visits v JOIN mentors m ON m.id = v.mentor_id
       WHERE v.school_id = ? AND v.date < ? ORDER BY v.date DESC, v.created_at DESC LIMIT 1`,
    ),
    latestVisit: db.prepare('SELECT id, date FROM visits WHERE school_id = ? ORDER BY date DESC, created_at DESC LIMIT 1'),
    visitOnDate: db.prepare('SELECT * FROM visits WHERE school_id = ? AND date = ? ORDER BY created_at DESC LIMIT 1'),
    suggestionsForVisit: db.prepare('SELECT * FROM suggestions WHERE visit_id = ? ORDER BY position'),
    pendingCount: db.prepare("SELECT COUNT(*) AS n FROM suggestions WHERE visit_id = ? AND state = 'pending'"),
    countForVisit: db.prepare('SELECT COUNT(*) AS n FROM suggestions WHERE visit_id = ?'),
    checkedInVisit: db.prepare('SELECT * FROM suggestions WHERE checked_in_visit = ? ORDER BY position'),
    routeStops: db.prepare('SELECT * FROM route_stops WHERE mentor_id = ? AND date = ? ORDER BY position'),
    insertStop: db.prepare('INSERT INTO route_stops (mentor_id, date, position, school_id) VALUES (?, ?, ?, ?)'),
    insertVisit: db.prepare(
      `INSERT INTO visits (id, client_id, school_id, mentor_id, date, time, summary, strength, note, lang, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertSuggestion: db.prepare(
      `INSERT INTO suggestions (id, visit_id, school_id, position, text, how, theme)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    checkSuggestion: db.prepare(
      `UPDATE suggestions SET state = ?, checked_on = ?, checked_in_visit = ?
       WHERE id = ? AND school_id = ? AND state = 'pending'`,
    ),
    suggestionById: db.prepare('SELECT * FROM suggestions WHERE id = ?'),
    clusterVisitsBetween: db.prepare(
      `SELECT v.* FROM visits v JOIN schools s ON s.id = v.school_id
       WHERE s.cluster_id = ? AND v.date > ? AND v.date <= ?`,
    ),
    clusterThemesBetween: db.prepare(
      `SELECT sg.theme, v.school_id FROM suggestions sg
       JOIN visits v ON v.id = sg.visit_id JOIN schools s ON s.id = v.school_id
       WHERE s.cluster_id = ? AND v.date > ? AND v.date <= ? AND sg.theme IS NOT NULL`,
    ),
    patternEdits: db.prepare('SELECT * FROM pattern_edits WHERE cluster_id = ?'),
    upsertPatternEdit: db.prepare(
      `INSERT INTO pattern_edits (cluster_id, theme, title, body, edited_by) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (cluster_id, theme) DO UPDATE SET title = excluded.title, body = excluded.body,
         edited_by = excluded.edited_by, edited_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ),
  };

  function toVisit(r: Row): Visit {
    return {
      id: String(r.id),
      schoolId: String(r.school_id),
      date: String(r.date),
      time: (r.time as string | null) ?? null,
      mentorId: String(r.mentor_id),
      mentorName: String(r.mentor_name),
      summary: String(r.summary),
      strength: String(r.strength),
      items: (q.suggestionsForVisit.all(String(r.id)) as Row[]).map(toSuggestion),
    };
  }

  function summarize(s: School, today: string): SchoolSummary {
    const last = q.lastVisitBefore.get(s.id, today) as Row | undefined;
    const latest = q.latestVisit.get(s.id) as Row | undefined;
    const count = (visitId: unknown) => (q.pendingCount.get(String(visitId)) as { n: number }).n;
    return {
      ...s,
      lastVisitDate: last ? String(last.date) : null,
      visitedToday: latest ? latest.date === today : false,
      toCheck: last ? count(last.id) : 0,
      openCount: latest ? count(latest.id) : 0,
    };
  }

  const repo = {
    mentor(id: string): Mentor | null {
      const r = q.mentor.get(id) as Row | undefined;
      return r ? toMentor(r) : null;
    },

    mentorByPhone(phone: string): (Mentor & { pinHash: string }) | null {
      const r = q.mentorByPhone.get(phone) as Row | undefined;
      return r ? { ...toMentor(r), pinHash: String(r.pin_hash) } : null;
    },

    cluster(id: string): Cluster | null {
      const r = q.cluster.get(id) as Row | undefined;
      return r ? { id: String(r.id), name: String(r.name), block: String(r.block), district: String(r.district) } : null;
    },

    school(id: string): School | null {
      const r = q.school.get(id) as Row | undefined;
      return r ? toSchool(r) : null;
    },

    schools(clusterId: string, today: string): SchoolSummary[] {
      return (q.schoolsInCluster.all(clusterId) as Row[]).map((r) => summarize(toSchool(r), today));
    },

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

    /** Today's route. When none is planned yet, plans one: schools that have waited longest come first. */
    route(mentor: Mentor, date: string): RouteStop[] {
      let stops = q.routeStops.all(mentor.id, date) as Row[];
      if (stops.length === 0) {
        const candidates = repo
          .schools(mentor.clusterId, date)
          .sort((a, b) => (a.lastVisitDate ?? '').localeCompare(b.lastVisitDate ?? ''))
          .slice(0, ROUTE_LENGTH);
        transaction(db, () => candidates.forEach((s, i) => q.insertStop.run(mentor.id, date, i + 1, s.id)));
        stops = q.routeStops.all(mentor.id, date) as Row[];
      }
      return stops.map((stop) => {
        const school = repo.school(String(stop.school_id))!;
        const v = q.visitOnDate.get(school.id, date) as Row | undefined;
        return {
          position: Number(stop.position),
          school: summarize(school, date),
          visit: v
            ? {
                time: (v.time as string | null) ?? null,
                savedCount: (q.countForVisit.get(String(v.id)) as { n: number }).n,
                checkedCount: (q.checkedInVisit.all(String(v.id)) as Row[]).length,
              }
            : null,
        };
      });
    },

    routePosition(mentorId: string, date: string, schoolId: string): { position: number; total: number } | null {
      const stops = q.routeStops.all(mentorId, date) as Row[];
      const i = stops.findIndex((s) => s.school_id === schoolId);
      return i < 0 ? null : { position: Number(stops[i].position), total: stops.length };
    },

    /** Saves a visit. Safe to call twice with the same clientId (offline sync retries). */
    createVisit(mentor: Mentor, req: NewVisitRequest): SavedVisitResponse & { created: boolean } {
      const existing = q.visitByClientId.get(req.clientId) as Row | undefined;
      if (existing) return { ...repo.savedVisit(String(existing.id)), created: false };

      const visitId = randomUUID();
      const actions = req.draft.actions
        .map((a) => ({ do: a.do.trim().replace(/[.।]$/, ''), how: a.how.trim() }))
        .filter((a) => a.do);
      const summary = req.draft.summary.trim() || actions.map((a) => a.do).join('; ');

      transaction(db, () => {
        q.insertVisit.run(
          visitId, req.clientId, req.schoolId, mentor.id, req.date, req.time,
          summary, req.draft.strength.trim(), req.note, req.lang, req.source,
        );
        for (const [id, state] of Object.entries(req.checks)) {
          q.checkSuggestion.run(state, req.date, visitId, id, req.schoolId);
        }
        actions.forEach((a, i) => {
          q.insertSuggestion.run(randomUUID(), visitId, req.schoolId, i + 1, a.do, a.how, classifySuggestion(`${a.do} ${a.how}`));
        });
      });
      return { ...repo.savedVisit(visitId), created: true };
    },

    savedVisit(visitId: string): SavedVisitResponse {
      const visit = toVisit(q.visitById.get(visitId) as Row);
      const closed = (q.checkedInVisit.all(visitId) as Row[]).map((r) => ({
        id: String(r.id),
        text: String(r.text),
        state: r.state as CheckedState,
      }));
      return { visit, closed };
    },

    /**
     * Themes that recur across a cluster's schools in the last `periodDays`,
     * compared with the period before.
     */
    patterns(clusterId: string, date: string, periodDays = 60): PatternsResponse {
      const cluster = repo.cluster(clusterId)!;
      const schools = (q.schoolsInCluster.all(clusterId) as Row[]).map((r) => ({ id: String(r.id), name: String(r.name) }));
      const start = addDays(date, -periodDays);
      const prevStart = addDays(date, -2 * periodDays);

      const collect = (from: string, to: string) => {
        const byTheme = new Map<string, Set<string>>();
        const add = (theme: string, schoolId: string) => {
          if (!byTheme.has(theme)) byTheme.set(theme, new Set());
          byTheme.get(theme)!.add(schoolId);
        };
        for (const r of q.clusterThemesBetween.all(clusterId, from, to) as Row[]) add(String(r.theme), String(r.school_id));
        const visits = q.clusterVisitsBetween.all(clusterId, from, to) as Row[];
        for (const v of visits) for (const t of strengthThemes(String(v.strength))) add(t, String(v.school_id));
        return { byTheme, visitCount: visits.length };
      };

      const now = collect(start, date);
      const before = collect(prevStart, start);
      const edits = new Map((q.patternEdits.all(clusterId) as Row[]).map((r) => [String(r.theme), r]));

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
      return { cluster, periodDays, schools, visitCount: now.visitCount, patterns };
    },

    editPattern(clusterId: string, theme: string, title: string, body: string, mentorId: string) {
      q.upsertPatternEdit.run(clusterId, theme, title, body, mentorId);
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
