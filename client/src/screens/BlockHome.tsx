import { useState } from 'react';
import { Link } from 'react-router';
import { isoDate, parseDate, MONTHS, WEEKDAYS, plural, shortDate, type BlockOverview, type MentorStats, type SchoolSummary } from '@smaran/shared';
import { Icon } from '../components/Icon';
import { Loading, Problem, StaleNote, TabBar, TabHeader } from '../components/ui';
import { getSession, problemText, put } from '../lib/api';
import { useData } from '../lib/useData';

/** The coordinator's view of the block: coverage per CRP, schools waiting too long, and schools without a CRP. */
export function BlockHome() {
  const today = isoDate();
  const { data, error, loading, fromCache, reload } = useData<BlockOverview>(`/block?date=${today}`);
  const me = getSession()!.user;
  const d = parseDate(today);

  return (
    <>
      <TabHeader />
      <main>
        <div className="greet">
          <h1>Namaste, {me.firstName}</h1>
          <p>
            {WEEKDAYS[d.getDay()]}, {d.getDate()} {MONTHS[d.getMonth()]}. {data ? `${data.block.name} block, ${data.block.district}.` : ''}
          </p>
        </div>
        {loading && !data && <Loading />}
        {error != null && !data && <Problem error={error} onRetry={reload} />}
        <StaleNote show={fromCache} />
        {data && (
          <>
            <section className="sec" aria-label="CRPs">
              <h2>CRPs in the block</h2>
              <ul className="mentors">
                {data.mentors.map((m) => (
                  <MentorRow key={m.user.id} m={m} />
                ))}
              </ul>
            </section>

            {data.unassigned.length > 0 && <Unassigned schools={data.unassigned} mentors={data.mentors} onChanged={reload} />}

            <section className="sec" aria-label="Overdue schools">
              <h2>
                Not visited in {data.overdueDays} days <span className="count">{data.overdue.length}</span>
              </h2>
              {data.overdue.length === 0 ? (
                <p className="hint">Every school has had a visit in the last {data.overdueDays} days.</p>
              ) : (
                <ul className="items">
                  {data.overdue.slice(0, 8).map(({ school, days }) => (
                    <li key={school.id}>
                      <Link className="row plain" to={`/schools/${school.id}`}>
                        <span className="row-main">
                          <span className="row-name name">{school.name}</span>
                          <span className="row-foot">
                            <span className="chip chip-look">{days === null ? 'Never visited' : `${days} days`}</span>
                            <span className="muted">{school.mentorName ?? 'No CRP'}</span>
                          </span>
                        </span>
                        <Icon name="chev" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {data.recentHandovers.length > 0 && (
              <section className="sec" aria-label="Recent handovers">
                <h2>Recent handovers</h2>
                <ul className="rem-list">
                  {data.recentHandovers.map((h) => (
                    <li key={h.id} className="rem">
                      <span className="rem-flag" aria-hidden="true">
                        <Icon name="swap" small />
                      </span>
                      <span>
                        <span className="rem-text">
                          {h.fromName} to {h.toName}
                        </span>
                        <small>
                          {plural(h.schoolCount, 'school')}, {plural(h.reminderCount, 'reminder')}, {shortDate(h.date, today)}
                        </small>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
      <TabBar />
    </>
  );
}

function MentorRow({ m }: { m: MentorStats }) {
  const coverage = m.schools ? Math.min(1, m.visited30 / m.schools) : 0;
  return (
    <li>
      <Link className="mentor" to={`/people/${m.user.id}`}>
        <span className="mentor-head">
          <b>{m.user.name}</b>
          <span className="muted">{m.clusterName?.replace('Jan Shiksha Kendra ', '') ?? ''}</span>
        </span>
        {m.schools === 0 ? (
          <span className="hint">No schools yet</span>
        ) : (
          <>
            <span className="meter" aria-hidden="true">
              <i style={{ width: `${coverage * 100}%` }} />
            </span>
            <span className="mentor-stats">
              <span>
                <b className="num">
                  {m.visited30} of {m.schools}
                </b>{' '}
                visited in 30 days
              </span>
              {m.overdue > 0 && <span className="chip chip-look">{m.overdue} overdue</span>}
            </span>
            <span className="mentor-stats muted">
              <span>{m.followThrough === null ? 'No follow-ups checked yet' : `${m.followThrough}% of suggestions taken up`}</span>
              <span>{plural(m.openReminders, 'open reminder')}</span>
            </span>
          </>
        )}
      </Link>
    </li>
  );
}

function Unassigned({ schools, mentors, onChanged }: { schools: SchoolSummary[]; mentors: MentorStats[]; onChanged: () => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  const assign = async (schoolId: string, mentorId: string) => {
    if (!mentorId) return;
    try {
      await put(`/schools/${schoolId}/mentor`, { mentorId });
      onChanged();
    } catch (err) {
      setProblem(problemText(err));
    }
  };
  return (
    <section className="sec" aria-label="Schools without a CRP">
      <h2>
        Schools without a CRP <span className="count">{schools.length}</span>
      </h2>
      <ul className="items">
        {schools.map((s) => (
          <li key={s.id} className="assign">
            <span className="row-main">
              <span className="row-name name">{s.name}</span>
              <span className="muted">{s.lastVisitDate ? `Last visit ${shortDate(s.lastVisitDate)}` : 'Never visited'}</span>
            </span>
            <label className="vh" htmlFor={`assign-${s.id}`}>
              Assign {s.name} to
            </label>
            <select id={`assign-${s.id}`} className="select" defaultValue="" onChange={(e) => assign(s.id, e.target.value)}>
              <option value="">Assign to…</option>
              {mentors.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      {problem && <p className="error-line">{problem}</p>}
    </section>
  );
}
