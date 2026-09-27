import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clusters (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  block     TEXT NOT NULL,
  district  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mentors (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  first_name  TEXT NOT NULL,
  role        TEXT NOT NULL,
  phone       TEXT NOT NULL UNIQUE,
  pin_hash    TEXT NOT NULL,
  cluster_id  TEXT NOT NULL REFERENCES clusters(id)
);

CREATE TABLE IF NOT EXISTS schools (
  id           TEXT PRIMARY KEY,
  cluster_id   TEXT NOT NULL REFERENCES clusters(id),
  name         TEXT NOT NULL,
  village      TEXT NOT NULL,
  udise        TEXT NOT NULL UNIQUE,
  teacher      TEXT NOT NULL,
  class_label  TEXT NOT NULL,
  subject      TEXT NOT NULL
);

-- The ordered list of schools a mentor plans to visit on a date.
CREATE TABLE IF NOT EXISTS route_stops (
  mentor_id  TEXT NOT NULL REFERENCES mentors(id),
  date       TEXT NOT NULL,
  position   INTEGER NOT NULL,
  school_id  TEXT NOT NULL REFERENCES schools(id),
  PRIMARY KEY (mentor_id, date, school_id)
);

CREATE TABLE IF NOT EXISTS visits (
  id          TEXT PRIMARY KEY,
  client_id   TEXT UNIQUE,
  school_id   TEXT NOT NULL REFERENCES schools(id),
  mentor_id   TEXT NOT NULL REFERENCES mentors(id),
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

-- Wording a block officer or mentor has edited for a cluster pattern.
CREATE TABLE IF NOT EXISTS pattern_edits (
  cluster_id  TEXT NOT NULL REFERENCES clusters(id),
  theme       TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  edited_by   TEXT NOT NULL REFERENCES mentors(id),
  edited_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (cluster_id, theme)
);
`;

export function openDb(file: string): DB {
  if (file !== ':memory:') mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
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
  const row = db.prepare('SELECT COUNT(*) AS n FROM clusters').get() as { n: number };
  return row.n === 0;
}
