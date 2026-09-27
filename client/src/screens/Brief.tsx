import { Link, useNavigate, useParams } from 'react-router';
import { STATE_LABEL, daysBetween, isoDate, longDate, plural, relativeDays, shortDate, type BriefResponse } from '@smaran/shared';
import { Icon } from '../components/Icon';
import { Loading, Mark, Problem, StaleNote, Steps, TopBar } from '../components/ui';
import { getSession } from '../lib/api';
import { useFlow } from '../lib/flow';
import { useData } from '../lib/useData';
import { useSync } from '../lib/sync';

export function Brief() {
  const { schoolId = '' } = useParams();
  const today = isoDate();
  const { data, error, loading, fromCache, reload } = useData<BriefResponse>(`/schools/${schoolId}/brief?date=${today}`);
  const { flow, begin } = useFlow();
  const navigate = useNavigate();
  const me = getSession()?.mentor;
  const { queue } = useSync();
  const visitedToday = Boolean(data?.visitedToday) || queue.some((e) => e.request.schoolId === schoolId && e.request.date === today);

  const start = () => {
    begin(schoolId);
    navigate(`/visit/${schoolId}/observe`);
  };

  const last = data?.lastVisit;
  const pending = last?.items.filter((i) => i.state === 'pending') ?? [];
  const resuming = flow.schoolId === schoolId && !flow.saved && flow.note.trim().length > 0;

  return (
    <>
      <TopBar back="Today" backTo="/" right={<Link className="linkbtn" to={`/schools/${schoolId}`}>History</Link>} />
      <main>
        <Steps current={1} />
        {loading && !data && <Loading />}
        {error != null && !data && <Problem error={error} onRetry={reload} />}
        <StaleNote show={fromCache} />
        {data && (
          <>
            <header className="head">
              {data.stop && (
                <p className="stop">
                  Stop {data.stop.position} of {data.stop.total}
                </p>
              )}
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
              {pending.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <span className="chip chip-look">{plural(pending.length, 'thing')} to look for today</span>
                </div>
              )}
            </header>

            {!last ? (
              <div className="empty-note">
                <b>First visit on record</b>
                <span>Nothing to follow up yet. What you note today starts this school’s record, and the next visitor will see it here.</span>
              </div>
            ) : (
              <>
                <section className="sec">
                  <h2>Last visit</h2>
                  <p className="when">
                    <b>{longDate(last.date)}</b>, {relativeDays(daysBetween(last.date, today))}, by{' '}
                    {last.mentorId === me?.id ? 'you' : last.mentorName}
                    {last.mentorId !== me?.id && <span className="rot">another CRP</span>}
                  </p>
                  <p className="summary">{last.summary}</p>
                </section>
                <section className="sec">
                  <h2>Suggested last time</h2>
                  <ul className="items">
                    {last.items.map((i) => (
                      <li key={i.id}>
                        <Mark state={i.state} />
                        <div>
                          <p>{i.text}</p>
                          <p className={`st${i.state === 'pending' ? ' look' : ''}`}>
                            {i.state === 'pending'
                              ? 'Not checked yet. Look for this today.'
                              : `${STATE_LABEL[i.state]}${i.checkedOn ? `, marked ${shortDate(i.checkedOn, today)}` : ''}${i.note ? `. ${i.note}` : ''}`}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </>
        )}
      </main>
      {data && (
        <footer className="bar">
          {visitedToday ? (
            <Link className="btn btn-secondary" to={`/schools/${schoolId}`}>
              Already visited today. See the record
            </Link>
          ) : (
            <button className="btn btn-primary" onClick={start}>
              <Icon name="mic" />
              {resuming ? 'Continue observation' : 'Start observation'}
            </button>
          )}
        </footer>
      )}
    </>
  );
}
