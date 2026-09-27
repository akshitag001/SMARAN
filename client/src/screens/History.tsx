import { useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  MONTHS_SHORT,
  STATE_LABEL,
  isoDate,
  parseDate,
  plural,
  shortDate,
  type Handover,
  type HistoryResponse,
  type Lang,
  type Reminder,
  type Suggestion,
  type Visit,
} from '@smaran/shared';
import { Icon } from '../components/Icon';
import { ThumbRow } from '../components/photos';
import { Loading, Mark, Problem, StaleNote, StateLegend, TabBar, TeacherReplies, TopBar, useToast } from '../components/ui';
import { LangToggle, VoiceField } from '../components/voice';
import { getSession, newClientId, problemText } from '../lib/api';
import { postOrQueue } from '../lib/outbox';
import { useData } from '../lib/useData';
import { useSync } from '../lib/sync';
import { withQueued } from '../lib/visits';

type Entry = { kind: 'visit'; date: string; visit: Visit } | { kind: 'handover'; date: string; handover: Handover };

/** The school's memory: every visit, what was suggested and what became of it, reminders and handovers. */
export function History() {
  const { schoolId = '' } = useParams();
  const { data, error, loading, fromCache, reload } = useData<HistoryResponse>(`/schools/${schoolId}`);
  const { queue } = useSync();
  const session = getSession();
  const me = session?.user.id;
  const today = isoDate();

  const visits = data ? withQueued(data.visits, queue, schoolId) : [];
  const all: Suggestion[] = [...visits].reverse().flatMap((v) => v.items);
  const count = { done: 0, partly: 0, notyet: 0, pending: 0 };
  for (const i of all) count[i.state]++;
  const first = visits.length ? visits[visits.length - 1].date : null;

  const timeline: Entry[] = [
    ...visits.map((v): Entry => ({ kind: 'visit', date: v.date, visit: v })),
    ...(data?.handovers ?? []).map((h): Entry => ({ kind: 'handover', date: h.date, handover: h })),
  ].sort((a, b) => b.date.localeCompare(a.date) || (a.kind === 'visit' ? -1 : 1));

  return (
    <>
      <TopBar back="Back" right={data && session?.user.role !== 'teacher' ? <Link className="linkbtn" to={`/visit/${schoolId}`}>Brief</Link> : undefined} />
      <main>
        {loading && !data && <Loading />}
        {error != null && !data && <Problem error={error} onRetry={reload} />}
        <StaleNote show={fromCache} />
        {data && (
          <>
            <header className="head">
              <h1 className="name">{data.school.name}</h1>
              <p className="place num">
                {data.school.village}, UDISE {data.school.udise}
              </p>
              <div className="teacher">
                <span className="name">{data.school.teacher}</span>
                <span>
                  {data.school.classLabel}, {data.school.subject}
                </span>
              </div>
              <p className="hint" style={{ marginTop: 6 }}>
                {data.school.mentorName ? `CRP: ${data.school.mentorId === me ? 'you' : data.school.mentorName}` : 'No CRP assigned'}
              </p>
            </header>

            {visits.length > 0 && (
              <section className="tally" aria-label="Follow-through">
                <p>
                  {plural(visits.length, 'visit')} since {shortDate(first!, today)}. Of {plural(all.length, 'suggestion')},{' '}
                  <b>{count.done} taken up</b>
                  {count.partly ? `, ${count.partly} partly` : ''}
                  {count.notyet ? `, ${count.notyet} not yet` : ''}
                  {count.pending ? `, ${count.pending} waiting to be checked` : ''}.
                </p>
                <div className="strip" aria-hidden="true">
                  {all.map((i) => (
                    <Mark key={i.id} state={i.state} />
                  ))}
                </div>
                <StateLegend />
              </section>
            )}

            <RemindersSection schoolId={schoolId} reminders={data.reminders} onAdded={reload} />

            {visits.length === 0 ? (
              <div className="empty-note">
                <b>No visits on record yet</b>
                <span>The first observation saved here will start this school’s record.</span>
              </div>
            ) : (
              <ol className="tl" aria-label="Visits and handovers, newest first">
                {timeline.map((e) =>
                  e.kind === 'visit' ? (
                    <VisitEntry key={e.visit.id} visit={e.visit} me={me} today={today} />
                  ) : (
                    <HandoverEntry key={e.handover.id} h={e.handover} />
                  ),
                )}
              </ol>
            )}
          </>
        )}
      </main>
      <TabBar />
    </>
  );
}

function VisitEntry({ visit: v, me, today }: { visit: Visit; me?: string; today: string }) {
  const d = parseDate(v.date);
  const isToday = v.date === today;
  return (
    <li className={isToday ? 'today' : ''}>
      <div className="tl-date">
        <b>{d.getDate()}</b>
        <span>
          {MONTHS_SHORT[d.getMonth()]} {d.getFullYear()}
        </span>
      </div>
      <div className="tl-body">
        <p className="tl-by">
          {isToday && <span className="today-tag">Today</span>}
          {v.mentorId === me ? 'You' : v.mentorName}
          {v.time ? `, ${v.time}` : ''}
          {v.unsynced && <span className="unsynced">On this phone, not synced yet</span>}
        </p>
        <p className="tl-sum">{v.summary}</p>
        {v.strength && (
          <p className="tl-sum muted" style={{ fontSize: 16 }}>
            What worked: {v.strength}
          </p>
        )}
        <ul className="tl-items">
          {v.items.map((i) => (
            <li key={i.id}>
              <Mark state={i.state} />
              <span>
                {i.text}
                <small>
                  {STATE_LABEL[i.state]}
                  {i.checkedOn && i.state !== 'pending' ? `, checked ${shortDate(i.checkedOn, today)}` : ''}
                  {i.note ? `. ${i.note}` : ''}
                </small>
                <TeacherReplies responses={i.responses} />
              </span>
            </li>
          ))}
        </ul>
        <ThumbRow photos={v.photos} />
      </div>
    </li>
  );
}

function HandoverEntry({ h }: { h: Handover }) {
  const d = parseDate(h.date);
  return (
    <li className="handover">
      <div className="tl-date">
        <b>{d.getDate()}</b>
        <span>
          {MONTHS_SHORT[d.getMonth()]} {d.getFullYear()}
        </span>
      </div>
      <div className="tl-body">
        <p className="tl-by">Handover</p>
        <p className="tl-sum">
          {h.fromName} handed over to {h.toName}
        </p>
        {h.note && <p className="quote">“{h.note}”</p>}
      </div>
    </li>
  );
}

function RemindersSection({ schoolId, reminders, onAdded }: { schoolId: string; reminders: Reminder[]; onAdded: () => void }) {
  const session = getSession();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [toast, showToast] = useToast();
  const [lang, setLang] = useState<Lang>('en');
  const open = reminders.filter((r) => r.status === 'open');
  const closed = reminders.filter((r) => r.status !== 'open').slice(0, 5);
  const canAdd = session?.user.role === 'crp' || session?.user.role === 'brc';

  const add = async () => {
    setProblem(null);
    try {
      const sent = await postOrQueue(`Reminder for ${schoolId}`, `/schools/${schoolId}/reminders`, { clientId: newClientId(), text: text.trim(), date: isoDate() });
      setText('');
      showToast(sent ? 'Reminder saved for the next visit.' : 'Saved on this phone. It will sync when there is signal.');
      if (sent) onAdded();
    } catch (err) {
      setProblem(problemText(err));
    }
  };

  return (
    <section className="sec" aria-label="Reminders">
      <h2>Reminders for the next visit</h2>
      {open.length === 0 && <p className="hint">None open.</p>}
      {open.length > 0 && (
        <ul className="rem-list">
          {open.map((r) => (
            <li key={r.id} className="rem">
              <span className="rem-flag" aria-hidden="true">
                <Icon name="flag" small />
              </span>
              <span>
                <span className="rem-text">{r.text}</span>
                <small>
                  From {r.createdByName}, {shortDate(r.createdOn)}
                  {r.assignedToName ? `. For ${r.assignedToName}` : ''}
                </small>
              </span>
            </li>
          ))}
        </ul>
      )}
      {closed.length > 0 && (
        <details>
          <summary className="hint">Recently closed</summary>
          <ul className="rem-list">
            {closed.map((r) => (
              <li key={r.id} className="rem closed">
                <Mark state={r.status === 'done' ? 'done' : 'notyet'} />
                <span>
                  <span className="rem-text">{r.text}</span>
                  <small>
                    {r.status === 'done' ? 'Done' : 'Not needed'}
                    {r.closedByName ? `, ${r.closedByName}` : ''}
                    {r.closedOn ? `, ${shortDate(r.closedOn)}` : ''}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {canAdd && (
        <>
          <LangToggle lang={lang} onChange={setLang} />
          <VoiceField id="school-reminder" label="Add a reminder" lang={lang} rows={1} value={text} onChange={setText} placeholder="Something to check at the next visit" />
          <button className="add" disabled={text.trim().length < 3} onClick={add}>
            <Icon name="plus" small />
            Add reminder
          </button>
        </>
      )}
      {problem && <p className="error-line">{problem}</p>}
      {toast && <p className="toast">{toast}</p>}
    </section>
  );
}
