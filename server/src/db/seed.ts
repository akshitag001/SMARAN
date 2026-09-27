import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { addDays, classifySuggestion, isoDate, type ItemState, type ResponseStatus, type Role } from '@smaran/shared';
import { hashPin } from '../auth';
import { config } from '../config';
import { openDb, transaction, type DB } from './connection';

/**
 * Sample data: Phanda block (Bhopal) with two clusters, three CRPs, a block
 * coordinator and two teachers. Dates are relative to the day the seed runs.
 *
 * The story it tells: Anita Verma covered Bhanpur cluster until 30 days ago, then
 * moved to Barkheda and handed Bhanpur's schools to Suresh Rathore. Vikram Singh
 * has just joined Bhanpur and has no schools yet.
 */

export const DEMO_PIN = '1234';
export const DEMO_USERS = {
  crp: { phone: '9876543210', name: 'Suresh Rathore' },
  brc: { phone: '9876500022', name: 'Meera Joshi' },
  teacher: { phone: '9876500033', name: 'Kavita Yadav' },
} as const;
/** The CRP's sign-in, used by tests. */
export const DEMO_LOGIN = { phone: DEMO_USERS.crp.phone, pin: DEMO_PIN };

const BLOCK = { id: 'phanda', name: 'Phanda', district: 'Bhopal' };
const CLUSTERS = [
  { id: 'bhanpur', name: 'Jan Shiksha Kendra Bhanpur' },
  { id: 'barkheda', name: 'Jan Shiksha Kendra Barkheda' },
];

type UserSeed = { id: string; name: string; first: string; role: Role; phone: string; cluster?: string; school?: string };
const USERS: UserSeed[] = [
  { id: 'suresh', name: 'Suresh Rathore', first: 'Suresh', role: 'crp', phone: DEMO_USERS.crp.phone, cluster: 'bhanpur' },
  { id: 'anita', name: 'Anita Verma', first: 'Anita', role: 'crp', phone: '9876500011', cluster: 'barkheda' },
  { id: 'vikram', name: 'Vikram Singh', first: 'Vikram', role: 'crp', phone: '9876500055', cluster: 'bhanpur' },
  { id: 'meera', name: 'Meera Joshi', first: 'Meera', role: 'brc', phone: DEMO_USERS.brc.phone },
  { id: 't-kavita', name: 'Kavita Yadav', first: 'Kavita', role: 'teacher', phone: DEMO_USERS.teacher.phone, school: 'ratanpur' },
  { id: 't-ramesh', name: 'Ramesh Ahirwar', first: 'Ramesh', role: 'teacher', phone: '9876500044', school: 'bilkhiriya' },
];

type Item = [text: string, state: ItemState, checkedDaysAgo?: number, note?: string];
type VisitSeed = { daysAgo: number; mentor: string; summary: string; strength?: string; time?: string; items: Item[] };
type SchoolSeed = {
  id: string; cluster: string; mentor: string | null; name: string; village: string; udise: string;
  teacher: string; cls: string; subject: string; visits: VisitSeed[];
};

const S = 'suresh';
const A = 'anita';

const SCHOOLS: SchoolSeed[] = [
  {
    id: 'jhagariya', cluster: 'bhanpur', mentor: S, name: 'EGS Jhagariya', village: 'Jhagariya', udise: '23320405509', teacher: 'Smt. Shabana Khan', cls: 'Classes 1 and 2 (multigrade)', subject: 'Hindi',
    visits: [
      { daysAgo: 0, mentor: S, time: '9:40 am', summary: 'Multigrade reading class; Class 1 children waited while Class 2 read aloud.', strength: 'Letter cards were on the floor within reach, and the print-rich wall now sits at eye level.',
        items: [['Give Class 1 a letter-card task while you read with Class 2', 'pending']] },
      { daysAgo: 89, mentor: A, summary: 'Letter cards used well; classroom walls had no children’s work on them.', strength: 'Letter cards from the kit were used for the whole first activity.',
        items: [['Put up a print-rich wall at children’s eye level', 'done', 0]] },
    ],
  },
  {
    id: 'ratanpur', cluster: 'bhanpur', mentor: S, name: 'GPS Ratanpur', village: 'Ratanpur', udise: '23320405201', teacher: 'Smt. Kavita Yadav', cls: 'Class 3', subject: 'Mathematics',
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
    id: 'bilkhiriya', cluster: 'bhanpur', mentor: S, name: 'GPS Bilkhiriya Kalan', village: 'Bilkhiriya Kalan', udise: '23320405307', teacher: 'Shri Ramesh Ahirwar', cls: 'Class 2', subject: 'Hindi reading',
    visits: [
      { daysAgo: 53, mentor: A, summary: 'Children repeated lines after the teacher; few read on their own.', strength: 'Children were comfortable and keen to read aloud.',
        items: [['Give every child a turn to read aloud this week', 'done', 32, 'Reported by the teacher at the cluster meeting'], ['Use the letter cards from the FLN kit every day', 'pending']] },
      { daysAgo: 199, mentor: S, summary: 'Story reading with a picture book went well; reading groups not used.',
        items: [['Seat children in two reading-level groups for 15 minutes', 'partly', 53]] },
    ],
  },
  {
    id: 'semri', cluster: 'bhanpur', mentor: S, name: 'GPS Semri Kalan', village: 'Semri Kalan', udise: '23320405412', teacher: 'Shri Dinesh Patel', cls: 'Class 4', subject: 'EVS',
    visits: [
      { daysAgo: 59, mentor: A, summary: 'Water sources lesson read from the book, without linking to the village’s own hand pump and pond.', strength: 'Clear board notes and a calm class.',
        items: [['Start the lesson with a question about the children’s own village', 'pending'], ['Let children talk in pairs for two minutes before answering', 'pending']] },
      { daysAgo: 250, mentor: S, summary: 'Good use of a village map drawn on chart paper.', strength: 'The village map on chart paper got every child talking.',
        items: [['Keep the village map on the wall and add to it each week', 'done', 59]] },
    ],
  },
  {
    id: 'kolukhedi', cluster: 'bhanpur', mentor: S, name: 'GMS Kolukhedi', village: 'Kolukhedi', udise: '23320405618', teacher: 'Km. Pooja Meena', cls: 'Class 6', subject: 'Science',
    visits: [],
  },
];

// The rest of the block, with lighter records built from common observations.
const TEMPLATES: Record<string, { summary: string; item: string; strength?: string }> = {
  names: { summary: 'Answers came mostly from volunteers in the front rows.', item: 'Call on children by name from every row, not only volunteers' },
  pace: { summary: 'Board examples moved faster than most children could follow.', item: 'After each board example, let children try one on slates' },
  levels: { summary: 'Level-wise groups set up in July were no longer in use.', item: 'Restart 15 minutes of level-wise group work daily' },
  books: { summary: 'Class started late while books were fetched from the office.', item: 'Keep books in the classroom so class starts on time' },
  tlm: { summary: 'Stick bundles and number cards were used well for place value.', item: 'Let children handle the bundles themselves in pairs', strength: 'Stick bundles and number cards made place value concrete.' },
  girls: { summary: 'Girls in the class rarely answered; boys took most turns.', item: 'Take answers from a girl and a boy in turn' },
  lecture: { summary: 'Mostly reading from the textbook, with little discussion.', item: 'Pause after each page for a two-minute pair discussion' },
};

type Rest = [id: string, cluster: string, mentor: string | null, name: string, teacher: string, cls: string, subject: string, visits: [daysAgo: number, mentor: string, tpl: string, state: ItemState][]];
const REST: Rest[] = [
  ['barkheda', 'bhanpur', S, 'GPS Barkheda Nathu', 'Shri Mukesh Verma', 'Class 4', 'Mathematics', [[39, A, 'names', 'pending'], [207, S, 'pace', 'done']]],
  ['mugaliya', 'bhanpur', S, 'GPS Mugaliya Chhap', 'Smt. Rekha Solanki', 'Class 3', 'Mathematics', [[37, A, 'tlm', 'pending'], [213, S, 'names', 'partly']]],
  ['phanda', 'bhanpur', S, 'GMS Phanda Kalan', 'Shri Anil Kushwaha', 'Class 7', 'English', [[24, S, 'levels', 'pending'], [165, A, 'lecture', 'done']]],
  ['tumda', 'bhanpur', S, 'GPS Tumda', 'Smt. Meena Rajput', 'Class 2', 'Mathematics', [[17, S, 'names', 'pending'], [148, A, 'tlm', 'done']]],
  ['khajuri', 'bhanpur', S, 'GPS Khajuri Sadak', 'Shri Santosh Malviya', 'Class 3', 'Hindi', [[19, S, 'levels', 'pending'], [191, A, 'books', 'done']]],
  ['nipaniya', 'bhanpur', S, 'GPS Nipaniya Jat', 'Km. Neha Lodhi', 'Class 5', 'Mathematics', [[31, A, 'pace', 'notyet'], [221, S, 'lecture', 'done']]],
  ['bagli', 'bhanpur', S, 'GPS Bagli', 'Shri Rajkumar Jatav', 'Class 3', 'Mathematics', [[12, S, 'pace', 'pending'], [172, A, 'tlm', 'done']]],
  ['sukhi', 'bhanpur', S, 'GMS Sukhi Sewaniya', 'Smt. Sunita Parmar', 'Class 6', 'Hindi', [[15, S, 'levels', 'pending'], [152, A, 'books', 'partly']]],
  ['bhairopur', 'bhanpur', S, 'GPS Bhairopur', 'Shri Imran Qureshi', 'Class 5', 'EVS', [[10, S, 'girls', 'pending'], [200, A, 'lecture', 'notyet']]],
  ['kolar', 'bhanpur', S, 'GPS Kolar Khurd', 'Smt. Lakshmi Dangi', 'Class 1', 'Hindi', [[46, A, 'books', 'done'], [234, S, 'levels', 'partly']]],
  ['salam', 'barkheda', A, 'GPS Barkheda Salam', 'Shri Gopal Meena', 'Class 3', 'Mathematics', [[8, A, 'pace', 'pending'], [120, A, 'names', 'done']]],
  ['amarpura', 'barkheda', A, 'GPS Amarpura', 'Smt. Nirmala Uikey', 'Class 2', 'Hindi', [[14, A, 'levels', 'pending']]],
  ['neelbad', 'barkheda', A, 'GMS Neelbad', 'Shri Arvind Tomar', 'Class 6', 'Science', [[21, A, 'lecture', 'pending'], [140, A, 'girls', 'partly']]],
  ['ratibad', 'barkheda', A, 'GPS Ratibad', 'Smt. Farida Bee', 'Class 4', 'EVS', [[5, A, 'names', 'pending']]],
  ['kerwa', 'barkheda', null, 'GPS Kerwa', 'Shri Hemant Dhakad', 'Class 3', 'Mathematics', [[95, A, 'pace', 'notyet']]],
  ['chandanpura', 'barkheda', null, 'EGS Chandanpura', 'Km. Rani Gond', 'Classes 1 to 3 (multigrade)', 'Hindi', []],
];

for (const [i, [id, cluster, mentor, name, teacher, cls, subject, visits]] of REST.entries()) {
  SCHOOLS.push({
    id, cluster, mentor, name, teacher, cls, subject,
    village: name.replace(/^(GPS|GMS|EGS) /, ''),
    udise: `233204057${i + 10}`,
    visits: visits.map(([daysAgo, m, tpl, state], j): VisitSeed => {
      const t = TEMPLATES[tpl];
      // The latest visit's items can only have been checked outside a visit (e.g. at the cluster meeting).
      const item: Item = state === 'pending' ? [t.item, state]
        : j === 0 ? [t.item, state, 5, 'Reported by the teacher at the cluster meeting']
        : [t.item, state, visits[j - 1][0]];
      return { daysAgo, mentor: m, summary: t.summary, strength: t.strength, items: [item] };
    }),
  });
}

type ReminderSeed = { school: string; text: string; by: string; daysAgo: number; inVisit?: number; assigned: string | null; closed?: { by: string; daysAgo: number; inVisit?: number } };
const REMINDERS: ReminderSeed[] = [
  { school: 'ratanpur', text: 'Check whether the library register is being filled', by: A, daysAgo: 75, inVisit: 75, assigned: S },
  { school: 'semri', text: 'Ask the SMC about the hand pump; children were leaving class to fetch water', by: A, daysAgo: 59, inVisit: 59, assigned: S },
  { school: 'bilkhiriya', text: 'See whether the letter cards are out of the cupboard and in use', by: A, daysAgo: 53, inVisit: 53, assigned: S },
  { school: 'kolukhedi', text: 'Introduce yourself to Pooja ji; the school has not had a visit this year', by: 'meera', daysAgo: 20, assigned: S },
  { school: 'jhagariya', text: 'Look at the print-rich wall', by: A, daysAgo: 89, inVisit: 89, assigned: S, closed: { by: S, daysAgo: 0, inVisit: 0 } },
];

type ResponseSeed = { school: string; visitDaysAgo: number; item: number; teacher: string; status: ResponseStatus; note: string; daysAgo: number };
const RESPONSES: ResponseSeed[] = [
  { school: 'ratanpur', visitDaysAgo: 75, item: 0, teacher: 't-kavita', status: 'trying', note: 'I have been calling children by name for two weeks. The back benches answer sometimes now.', daysAgo: 20 },
  { school: 'ratanpur', visitDaysAgo: 75, item: 1, teacher: 't-kavita', status: 'help', note: 'We only have 20 slates for 38 children. Can the cluster help?', daysAgo: 12 },
  { school: 'bilkhiriya', visitDaysAgo: 53, item: 1, teacher: 't-ramesh', status: 'trying', note: 'Started using the letter cards in the first ten minutes of class.', daysAgo: 10 },
];

const HANDOVER_DAYS_AGO = 30;
const HANDOVER_NOTE =
  'Kavita ji at Ratanpur responds well when you show an activity first. Semri still needs a follow-up on the hand pump with the SMC. ' +
  'Kolukhedi has not been visited this year. Most schools are working on calling children by name.';

/** Today's planned route for the demo CRP. */
const ROUTE = ['jhagariya', 'ratanpur', 'bilkhiriya', 'semri', 'kolukhedi'];

export function seedDemo(db: DB, today = isoDate()): void {
  const day = (n: number) => addDays(today, -n);
  const stamp = (n: number, hh = '10') => `${day(n)}T${hh}:00:00.000Z`;

  transaction(db, () => {
    db.prepare('INSERT INTO blocks (id, name, district) VALUES (?, ?, ?)').run(BLOCK.id, BLOCK.name, BLOCK.district);
    const insertCluster = db.prepare('INSERT INTO clusters (id, block_id, name) VALUES (?, ?, ?)');
    for (const c of CLUSTERS) insertCluster.run(c.id, BLOCK.id, c.name);

    const insertUser = db.prepare(
      'INSERT INTO users (id, name, first_name, role, phone, pin_hash, block_id, cluster_id, school_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const pinHash = hashPin(DEMO_PIN);
    for (const u of USERS) insertUser.run(u.id, u.name, u.first, u.role, u.phone, pinHash, BLOCK.id, u.cluster ?? null, u.school ?? null);

    const insertSchool = db.prepare(
      'INSERT INTO schools (id, cluster_id, name, village, udise, teacher, class_label, subject, mentor_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const insertVisit = db.prepare(
      'INSERT INTO visits (id, school_id, mentor_id, date, time, summary, strength, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const insertSuggestion = db.prepare(
      'INSERT INTO suggestions (id, visit_id, school_id, position, text, how, theme, state, checked_on, checked_in_visit, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const suggestionIds = new Map<string, string[]>();

    for (const s of SCHOOLS) {
      insertSchool.run(s.id, s.cluster, s.name, s.village, s.udise, s.teacher, s.cls, s.subject, s.mentor);
      const visitId = (daysAgo: number) => `${s.id}-${daysAgo}`;
      // All visits first, so a suggestion can point at the later visit that checked it.
      for (const v of s.visits) {
        insertVisit.run(visitId(v.daysAgo), s.id, v.mentor, day(v.daysAgo), v.time ?? null, v.summary, v.strength ?? '', 'self', stamp(v.daysAgo));
      }
      const visitDays = new Set(s.visits.map((v) => v.daysAgo));
      for (const v of s.visits) {
        const ids: string[] = [];
        v.items.forEach(([text, state, checkedDaysAgo, note], i) => {
          const id = randomUUID();
          ids.push(id);
          const checked = state !== 'pending' && checkedDaysAgo !== undefined;
          const checkedIn = checked && !note && visitDays.has(checkedDaysAgo!) ? visitId(checkedDaysAgo!) : null;
          insertSuggestion.run(
            id, visitId(v.daysAgo), s.id, i + 1, text, '', classifySuggestion(text), state,
            checked ? day(checkedDaysAgo!) : null, checkedIn, note ?? null,
          );
        });
        suggestionIds.set(visitId(v.daysAgo), ids);
      }
    }

    const insertResponse = db.prepare('INSERT INTO teacher_responses (id, suggestion_id, teacher_id, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (const r of RESPONSES) {
      const sid = suggestionIds.get(`${r.school}-${r.visitDaysAgo}`)![r.item];
      insertResponse.run(randomUUID(), sid, r.teacher, r.status, r.note, stamp(r.daysAgo, '16'));
    }

    const insertReminder = db.prepare(
      `INSERT INTO reminders (id, school_id, text, status, created_by, created_on, created_in_visit, assigned_to, closed_by, closed_on, closed_in_visit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const r of REMINDERS) {
      insertReminder.run(
        randomUUID(), r.school, r.text, r.closed ? 'done' : 'open', r.by, day(r.daysAgo),
        r.inVisit !== undefined ? `${r.school}-${r.inVisit}` : null, r.assigned,
        r.closed?.by ?? null, r.closed ? day(r.closed.daysAgo) : null,
        r.closed?.inVisit !== undefined ? `${r.school}-${r.closed.inVisit}` : null,
      );
    }

    // Anita hands Bhanpur over to Suresh when she moves to Barkheda.
    const handoverId = randomUUID();
    const handedSchools = SCHOOLS.filter((s) => s.cluster === 'bhanpur').map((s) => s.id);
    db.prepare('INSERT INTO handovers (id, from_user, to_user, done_by, note, reminder_count, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(handoverId, A, S, 'meera', HANDOVER_NOTE, 3, day(HANDOVER_DAYS_AGO), stamp(HANDOVER_DAYS_AGO));
    const insertHandedSchool = db.prepare('INSERT INTO handover_schools (handover_id, school_id) VALUES (?, ?)');
    for (const id of handedSchools) insertHandedSchool.run(handoverId, id);

    const notify = db.prepare('INSERT INTO notifications (id, user_id, kind, title, body, link, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const n = (user: string, kind: string, title: string, body: string, link: string | null, daysAgo: number, read: boolean) =>
      notify.run(randomUUID(), user, kind, title, body, link, read ? stamp(daysAgo, '18') : null, stamp(daysAgo, '17'));
    n(S, 'handover', `Anita Verma handed over ${handedSchools.length} schools to you`, HANDOVER_NOTE, '/schools', HANDOVER_DAYS_AGO, true);
    n(S, 'reminder', 'Meera Joshi added a reminder for GMS Kolukhedi', 'Introduce yourself to Pooja ji; the school has not had a visit this year', '/visit/kolukhedi', 20, false);
    n(S, 'response', 'Kavita Yadav needs help at GPS Ratanpur', 'We only have 20 slates for 38 children. Can the cluster help?', '/visit/ratanpur', 12, false);
    n(S, 'response', 'Ramesh Ahirwar is trying a suggestion', 'Started using the letter cards in the first ten minutes of class.', '/visit/bilkhiriya', 10, false);
    n('t-kavita', 'feedback', 'New feedback from Anita Verma', 'Addition lesson. Most answers came from the front two rows, and board examples moved quickly.', '/', 75, true);
    n('meera', 'handover', 'Handover recorded: Anita Verma to Suresh Rathore', `${handedSchools.length} schools and 3 open reminders moved.`, '/people', HANDOVER_DAYS_AGO, true);

    const insertStop = db.prepare('INSERT INTO route_stops (user_id, date, position, school_id) VALUES (?, ?, ?, ?)');
    ROUTE.forEach((id, i) => insertStop.run(S, today, i + 1, id));
  });
}

// `npm run seed`: wipe the database and load the sample data.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  for (const suffix of ['', '-wal', '-shm']) rmSync(config.dbPath + suffix, { force: true });
  const db = openDb(config.dbPath);
  seedDemo(db);
  db.close();
  console.log(`Seeded ${config.dbPath}`);
  for (const [role, u] of Object.entries(DEMO_USERS)) console.log(`  ${role.padEnd(8)} ${u.name.padEnd(16)} ${u.phone}  PIN ${DEMO_PIN}`);
}
