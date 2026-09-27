import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { addDays, classifySuggestion, isoDate, type ItemState } from '@smaran/shared';
import { hashPin } from '../auth';
import { config } from '../config';
import { openDb, transaction, type DB } from './connection';

/**
 * Sample data: one Jan Shiksha Kendra (cluster) with 15 schools and two CRPs.
 * Dates are relative to the day the seed runs, so the data always looks current.
 */

export const DEMO_LOGIN = { phone: '9876543210', pin: '1234' };

const CLUSTER = { id: 'bhanpur', name: 'Jan Shiksha Kendra Bhanpur', block: 'Phanda', district: 'Bhopal' };

const MENTORS = [
  { id: 'suresh', name: 'Suresh Rathore', first: 'Suresh', role: 'CRP', phone: DEMO_LOGIN.phone },
  { id: 'anita', name: 'Anita Verma', first: 'Anita', role: 'CRP', phone: '9876500011' },
];

type Item = [text: string, state: ItemState, checkedDaysAgo?: number, note?: string];
type VisitSeed = { daysAgo: number; mentor: string; summary: string; strength?: string; time?: string; items: Item[] };
type SchoolSeed = { id: string; name: string; village: string; udise: string; teacher: string; cls: string; subject: string; visits: VisitSeed[] };

const S = 'suresh';
const A = 'anita';

const SCHOOLS: SchoolSeed[] = [
  {
    id: 'jhagariya', name: 'EGS Jhagariya', village: 'Jhagariya', udise: '23320405509', teacher: 'Smt. Shabana Khan', cls: 'Classes 1 and 2 (multigrade)', subject: 'Hindi',
    visits: [
      { daysAgo: 0, mentor: S, time: '9:40 am', summary: 'Multigrade reading class; Class 1 children waited while Class 2 read aloud.', strength: 'Letter cards were on the floor within reach, and the print-rich wall now sits at eye level.',
        items: [['Give Class 1 a letter-card task while you read with Class 2', 'pending']] },
      { daysAgo: 89, mentor: A, summary: 'Letter cards used well; classroom walls had no children’s work on them.', strength: 'Letter cards from the kit were used for the whole first activity.',
        items: [['Put up a print-rich wall at children’s eye level', 'done', 0]] },
    ],
  },
  {
    id: 'ratanpur', name: 'GPS Ratanpur', village: 'Ratanpur', udise: '23320405201', teacher: 'Smt. Kavita Yadav', cls: 'Class 3', subject: 'Mathematics',
    visits: [
      { daysAgo: 75, mentor: A, summary: 'Addition lesson. Most answers came from the front two rows, and board examples moved quickly.', strength: 'Stick bundles made tens and ones clear to the whole class.',
        items: [['Call on children by name from every row, not only volunteers', 'pending'], ['After each board example, let two children solve a similar one on slates', 'pending']] },
      { daysAgo: 158, mentor: A, summary: 'Class started 15 minutes late while workbooks were fetched from the office.',
        items: [['Keep workbooks in the classroom so class starts on time', 'done', 75]] },
      { daysAgo: 229, mentor: S, summary: 'Mostly board work and copying, with few chances for children to answer.',
        items: [['Have all children show answers on slates at the same time', 'done', 158], ['Write the day’s learning goal on the board', 'notyet', 158]] },
      { daysAgo: 313, mentor: S, summary: 'Mixed-level class taught as one group; about a third could not read two-digit numbers.',
        items: [['Spend 10 minutes daily in level-wise groups for number work', 'partly', 229]] },
    ],
  },
  {
    id: 'bilkhiriya', name: 'GPS Bilkhiriya Kalan', village: 'Bilkhiriya Kalan', udise: '23320405307', teacher: 'Shri Ramesh Ahirwar', cls: 'Class 2', subject: 'Hindi reading',
    visits: [
      { daysAgo: 53, mentor: A, summary: 'Children repeated lines after the teacher; few read on their own.', strength: 'Children were comfortable and keen to read aloud.',
        items: [['Give every child a turn to read aloud this week', 'done', 29, 'Reported by the teacher at the cluster meeting'], ['Use the letter cards from the FLN kit every day', 'pending']] },
      { daysAgo: 199, mentor: S, summary: 'Story reading with a picture book went well; reading groups not used.',
        items: [['Seat children in two reading-level groups for 15 minutes', 'partly', 53]] },
    ],
  },
  {
    id: 'semri', name: 'GPS Semri Kalan', village: 'Semri Kalan', udise: '23320405412', teacher: 'Shri Dinesh Patel', cls: 'Class 4', subject: 'EVS',
    visits: [
      { daysAgo: 59, mentor: A, summary: 'Water sources lesson read from the book, without linking to the village’s own hand pump and pond.', strength: 'Clear board notes and a calm class.',
        items: [['Start the lesson with a question about the children’s own village', 'pending'], ['Let children talk in pairs for two minutes before answering', 'pending']] },
      { daysAgo: 250, mentor: S, summary: 'Good use of a village map drawn on chart paper.', strength: 'The village map on chart paper got every child talking.',
        items: [['Keep the village map on the wall and add to it each week', 'done', 59]] },
    ],
  },
  {
    id: 'kolukhedi', name: 'GMS Kolukhedi', village: 'Kolukhedi', udise: '23320405618', teacher: 'Km. Pooja Meena', cls: 'Class 6', subject: 'Science',
    visits: [],
  },
];

// The rest of the cluster, with lighter records built from common observations.
const TEMPLATES: Record<string, { summary: string; item: string; strength?: string }> = {
  names: { summary: 'Answers came mostly from volunteers in the front rows.', item: 'Call on children by name from every row, not only volunteers' },
  pace: { summary: 'Board examples moved faster than most children could follow.', item: 'After each board example, let children try one on slates' },
  levels: { summary: 'Level-wise groups set up in July were no longer in use.', item: 'Restart 15 minutes of level-wise group work daily' },
  books: { summary: 'Class started late while books were fetched from the office.', item: 'Keep books in the classroom so class starts on time' },
  tlm: { summary: 'Stick bundles and number cards were used well for place value.', item: 'Let children handle the bundles themselves in pairs', strength: 'Stick bundles and number cards made place value concrete.' },
  girls: { summary: 'Girls in the class rarely answered; boys took most turns.', item: 'Take answers from a girl and a boy in turn' },
  lecture: { summary: 'Mostly reading from the textbook, with little discussion.', item: 'Pause after each page for a two-minute pair discussion' },
};

const REST: [id: string, name: string, teacher: string, cls: string, subject: string, visits: [daysAgo: number, mentor: string, tpl: string, state: ItemState][]][] = [
  ['barkheda', 'GPS Barkheda Nathu', 'Shri Mukesh Verma', 'Class 4', 'Mathematics', [[39, A, 'names', 'pending'], [207, S, 'pace', 'done']]],
  ['mugaliya', 'GPS Mugaliya Chhap', 'Smt. Rekha Solanki', 'Class 3', 'Mathematics', [[37, A, 'tlm', 'pending'], [213, S, 'names', 'partly']]],
  ['phanda', 'GMS Phanda Kalan', 'Shri Anil Kushwaha', 'Class 7', 'English', [[24, S, 'levels', 'pending'], [165, A, 'lecture', 'done']]],
  ['tumda', 'GPS Tumda', 'Smt. Meena Rajput', 'Class 2', 'Mathematics', [[17, S, 'names', 'pending'], [148, A, 'tlm', 'done']]],
  ['khajuri', 'GPS Khajuri Sadak', 'Shri Santosh Malviya', 'Class 3', 'Hindi', [[19, S, 'levels', 'pending'], [191, A, 'books', 'done']]],
  ['nipaniya', 'GPS Nipaniya Jat', 'Km. Neha Lodhi', 'Class 5', 'Mathematics', [[31, A, 'pace', 'notyet'], [221, S, 'lecture', 'done']]],
  ['bagli', 'GPS Bagli', 'Shri Rajkumar Jatav', 'Class 3', 'Mathematics', [[12, S, 'pace', 'pending'], [172, A, 'tlm', 'done']]],
  ['sukhi', 'GMS Sukhi Sewaniya', 'Smt. Sunita Parmar', 'Class 6', 'Hindi', [[15, S, 'levels', 'pending'], [152, A, 'books', 'partly']]],
  ['bhairopur', 'GPS Bhairopur', 'Shri Imran Qureshi', 'Class 5', 'EVS', [[10, S, 'girls', 'pending'], [200, A, 'lecture', 'notyet']]],
  ['kolar', 'GPS Kolar Khurd', 'Smt. Lakshmi Dangi', 'Class 1', 'Hindi', [[46, A, 'books', 'done'], [234, S, 'levels', 'partly']]],
];

for (const [i, [id, name, teacher, cls, subject, visits]] of REST.entries()) {
  SCHOOLS.push({
    id, name, teacher, cls, subject,
    village: name.replace(/^(GPS|GMS|EGS) /, ''),
    udise: `233204057${i + 10}`,
    visits: visits.map(([daysAgo, mentor, tpl, state], j): VisitSeed => {
      const t = TEMPLATES[tpl];
      // The latest visit's items can only have been checked outside a visit (e.g. at the cluster meeting).
      const item: Item = state === 'pending' ? [t.item, state]
        : j === 0 ? [t.item, state, 5, 'Reported by the teacher at the cluster meeting']
        : [t.item, state, visits[j - 1][0]];
      return { daysAgo, mentor, summary: t.summary, strength: t.strength, items: [item] };
    }),
  });
}

/** Today's planned route for the demo mentor. */
const ROUTE = ['jhagariya', 'ratanpur', 'bilkhiriya', 'semri', 'kolukhedi'];

export function seedDemo(db: DB, today = isoDate()): void {
  transaction(db, () => {
    db.prepare('INSERT INTO clusters (id, name, block, district) VALUES (?, ?, ?, ?)').run(CLUSTER.id, CLUSTER.name, CLUSTER.block, CLUSTER.district);
    const insertMentor = db.prepare('INSERT INTO mentors (id, name, first_name, role, phone, pin_hash, cluster_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for (const m of MENTORS) insertMentor.run(m.id, m.name, m.first, m.role, m.phone, hashPin(DEMO_LOGIN.pin), CLUSTER.id);

    const insertSchool = db.prepare('INSERT INTO schools (id, cluster_id, name, village, udise, teacher, class_label, subject) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const insertVisit = db.prepare('INSERT INTO visits (id, school_id, mentor_id, date, time, summary, strength, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const insertSuggestion = db.prepare(
      'INSERT INTO suggestions (id, visit_id, school_id, position, text, how, theme, state, checked_on, checked_in_visit, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );

    for (const s of SCHOOLS) {
      insertSchool.run(s.id, CLUSTER.id, s.name, s.village, s.udise, s.teacher, s.cls, s.subject);
      const ids = new Map<number, string>();
      for (const v of s.visits) ids.set(v.daysAgo, `${s.id}-${v.daysAgo}`);
      // All visits first, so a suggestion can point at the later visit that checked it.
      for (const v of s.visits) {
        const date = addDays(today, -v.daysAgo);
        insertVisit.run(ids.get(v.daysAgo)!, s.id, v.mentor, date, v.time ?? null, v.summary, v.strength ?? '', 'self', `${date}T10:00:00.000Z`);
      }
      for (const v of s.visits) {
        v.items.forEach(([text, state, checkedDaysAgo, note], i) => {
          const checked = state !== 'pending' && checkedDaysAgo !== undefined;
          insertSuggestion.run(
            randomUUID(), ids.get(v.daysAgo)!, s.id, i + 1, text, '', classifySuggestion(text), state,
            checked ? addDays(today, -checkedDaysAgo) : null,
            checked && !note ? ids.get(checkedDaysAgo) ?? null : null,
            note ?? null,
          );
        });
      }
    }

    const insertStop = db.prepare('INSERT INTO route_stops (mentor_id, date, position, school_id) VALUES (?, ?, ?, ?)');
    ROUTE.forEach((id, i) => insertStop.run('suresh', today, i + 1, id));
  });
}

// `npm run seed`: wipe the database and load the sample data.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  for (const suffix of ['', '-wal', '-shm']) rmSync(config.dbPath + suffix, { force: true });
  const db = openDb(config.dbPath);
  seedDemo(db);
  db.close();
  console.log(`Seeded ${config.dbPath}\nSign in with ${DEMO_LOGIN.phone}, PIN ${DEMO_LOGIN.pin}`);
}
