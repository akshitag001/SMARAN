import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export type DB = DatabaseSync;

/** Bump when the schema changes; an older database is rebuilt (see openDb). */
export const SCHEMA_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS blocks (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  district  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clusters (
  id        TEXT PRIMARY KEY,
  block_id  TEXT NOT NULL REFERENCES blocks(id),
  name      TEXT NOT NULL
);

-- Everyone who signs in: CRPs, block coordinators and teachers.
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  first_name  TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('crp', 'brc', 'teacher')),
  phone       TEXT NOT NULL UNIQUE,
  pin_hash    TEXT NOT NULL,
  block_id    TEXT NOT NULL REFERENCES blocks(id),
  cluster_id  TEXT REFERENCES clusters(id),
  school_id   TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS schools (
  id           TEXT PRIMARY KEY,
  cluster_id   TEXT NOT NULL REFERENCES clusters(id),
  name         TEXT NOT NULL,
  village      TEXT NOT NULL,
  udise        TEXT NOT NULL UNIQUE,
  teacher      TEXT NOT NULL,
  class_label  TEXT NOT NULL,
  subject      TEXT NOT NULL,
  -- The CRP currently responsible for this school.
  mentor_id    TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS route_stops (
  user_id    TEXT NOT NULL REFERENCES users(id),
  date       TEXT NOT NULL,
  position   INTEGER NOT NULL,
  school_id  TEXT NOT NULL REFERENCES schools(id),
  PRIMARY KEY (user_id, date, school_id)
);

CREATE TABLE IF NOT EXISTS visits (
  id          TEXT PRIMARY KEY,
  client_id   TEXT UNIQUE,
  school_id   TEXT NOT NULL REFERENCES schools(id),
  mentor_id   TEXT NOT NULL REFERENCES users(id),
  date        TEXT NOT NULL,
  time        TEXT,
  summary     TEXT NOT NULL DEFAULT '',
  strength    TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  lang        TEXT NOT NULL DEFAULT 'en',
  source      TEXT NOT NULL DEFAULT 'self',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS visits_by_school ON visits (school_id, date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS suggestions (
  id                TEXT PRIMARY KEY,
  visit_id          TEXT NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
  school_id         TEXT NOT NULL REFERENCES schools(id),
  position          INTEGER NOT NULL,
  text              TEXT NOT NULL,
  how               TEXT NOT NULL DEFAULT '',
  theme             TEXT,
  state             TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'done', 'partly', 'notyet')),
  checked_on        TEXT,
  checked_in_visit  TEXT REFERENCES visits(id),
  note              TEXT
);
CREATE INDEX IF NOT EXISTS suggestions_by_visit ON suggestions (visit_id, position);

-- What a teacher says about a suggestion between visits.
CREATE TABLE IF NOT EXISTS teacher_responses (
  id             TEXT PRIMARY KEY,
  suggestion_id  TEXT NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  teacher_id     TEXT NOT NULL REFERENCES users(id),
  status         TEXT NOT NULL CHECK (status IN ('trying', 'done', 'help')),
  note           TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS responses_by_suggestion ON teacher_responses (suggestion_id, created_at DESC);

-- Notes for the next visit. They belong to the school, so whoever visits next sees them.
CREATE TABLE IF NOT EXISTS reminders (
  id                TEXT PRIMARY KEY,
  client_id         TEXT UNIQUE,
  school_id         TEXT NOT NULL REFERENCES schools(id),
  text              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dropped')),
  created_by        TEXT NOT NULL REFERENCES users(id),
  created_on        TEXT NOT NULL,
  created_in_visit  TEXT REFERENCES visits(id),
  assigned_to       TEXT REFERENCES users(id),
  closed_by         TEXT REFERENCES users(id),
  closed_on         TEXT,
  closed_in_visit   TEXT REFERENCES visits(id)
);
CREATE INDEX IF NOT EXISTS reminders_by_school ON reminders (school_id, status);

CREATE TABLE IF NOT EXISTS photos (
  id                TEXT PRIMARY KEY,
  client_id         TEXT UNIQUE,
  school_id         TEXT NOT NULL REFERENCES schools(id),
  visit_id          TEXT REFERENCES visits(id),
  visit_client_id   TEXT,
  uploaded_by       TEXT NOT NULL REFERENCES users(id),
  caption           TEXT NOT NULL DEFAULT '',
  mime              TEXT NOT NULL,
  bytes             INTEGER NOT NULL,
  file              TEXT NOT NULL,
  taken_at          TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS photos_by_visit ON photos (visit_id);

-- A CRP's schools and open reminders moving to someone else.
CREATE TABLE IF NOT EXISTS handovers (
  id              TEXT PRIMARY KEY,
  from_user       TEXT NOT NULL REFERENCES users(id),
  to_user         TEXT NOT NULL REFERENCES users(id),
  done_by         TEXT NOT NULL REFERENCES users(id),
  note            TEXT NOT NULL DEFAULT '',
  reminder_count  INTEGER NOT NULL DEFAULT 0,
  date            TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS handover_schools (
  handover_id  TEXT NOT NULL REFERENCES handovers(id) ON DELETE CASCADE,
  school_id    TEXT NOT NULL REFERENCES schools(id),
  PRIMARY KEY (handover_id, school_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  link        TEXT,
  read_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS notifications_by_user ON notifications (user_id, created_at DESC);

-- Wording a coordinator or CRP has edited for a pattern. scope is "cluster:<id>" or "block:<id>".
CREATE TABLE IF NOT EXISTS pattern_edits (
  scope      TEXT NOT NULL,
  theme      TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  edited_by  TEXT NOT NULL REFERENCES users(id),
  edited_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (scope, theme)
);
`;

const TABLES = [
  'pattern_edits', 'notifications', 'handover_schools', 'handovers', 'photos', 'reminders', 'teacher_responses',
  'suggestions', 'visits', 'route_stops', 'schools', 'users', 'mentors', 'clusters', 'blocks',
];

export function openDb(file: string): DB {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version !== SCHEMA_VERSION) {
    // An older prototype database: it only ever held sample data, so rebuild it.
    db.exec('PRAGMA foreign_keys = OFF;');
    for (const t of TABLES) db.exec(`DROP TABLE IF EXISTS ${t};`);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

export function transaction<T>(db: DB, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function isEmpty(db: DB): boolean {
  const row = db.prepare('SELECT COUNT(*) AS n FROM blocks').get() as { n: number };
  return row.n === 0;
}
