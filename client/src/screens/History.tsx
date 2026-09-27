import { useParams } from 'react-router';
import { MONTHS_SHORT, STATE_LABEL, isoDate, parseDate, plural, shortDate, type HistoryResponse, type Suggestion } from '@smaran/shared';
import { Loading, Mark, Problem, StaleNote, StateLegend, TabBar, TopBar } from '../components/ui';
import { getSession } from '../lib/api';
import { useData } from '../lib/useData';
import { useSync } from '../lib/sync';
import { withQueued } from '../lib/visits';

/** The school's memory: every visit, what was suggested, and what became of it. */
export function History() {
  const { schoolId = '' } = useParams();
  const { data, error, loading, fromCache, reload } = useData<HistoryResponse>(`/schools/${schoolId}`);
  const { queue } = useSync();
  const me = getSession()?.mentor.id;
  const today = isoDate();

  const visits = data ? withQueued(data.visits, queue, schoolId) : [];
  const all: Suggestion[] = [...visits].reverse().flatMap((v) => v.items);
  const count = { done: 0, partly: 0, notyet: 0, pending: 0 };
  for (const i of all) count[i.state]++;
  const first = visits.length ? visits[visits.length - 1].date : null;

  return (
    <>
      <TopBar back="Back" />
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
            </header>

            {visits.length === 0 ? (
              <div className="empty-note">
                <b>No visits on record yet</b>
                <span>The first observation saved here will start this school’s record.</span>
              </div>
            ) : (
              <>
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

                <ol className="tl" aria-label="Visits, newest first">
                  {visits.map((v) => {
                    const d = parseDate(v.date);
                    const isToday = v.date === today;
                    return (
                      <li key={v.id} className={isToday ? 'today' : ''}>
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
                          {v.strength && <p className="tl-sum muted" style={{ fontSize: 16 }}>What worked: {v.strength}</p>}
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
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </>
            )}
          </>
        )}
      </main>
      <TabBar />
    </>
  );
}
