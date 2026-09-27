import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ROLE_LABEL, isoDate, plural, shortDate, type CaseloadResponse } from '@smaran/shared';
import { Icon } from '../components/Icon';
import { Loading, Problem, StaleNote, TabBar, TopBar } from '../components/ui';
import { problemText, put } from '../lib/api';
import { useData } from '../lib/useData';

/** One CRP's schools, for the coordinator: move a single school, or hand over all of them. */
export function MentorDetail() {
  const { userId = '' } = useParams();
  const today = isoDate();
  const { data, error, loading, fromCache, reload } = useData<CaseloadResponse>(`/users/${userId}/caseload?date=${today}`);
  const [problem, setProblem] = useState<string | null>(null);

  const move = async (schoolId: string, mentorId: string) => {
    if (!mentorId) return;
    setProblem(null);
    try {
      await put(`/schools/${schoolId}/mentor`, { mentorId });
      reload();
    } catch (err) {
      setProblem(problemText(err));
    }
  };

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
              <h1>{data.user.name}</h1>
              <p className="place">
                {ROLE_LABEL[data.user.role]}
                {data.cluster ? `, ${data.cluster.name}` : ''}
                {!data.user.active ? ', no longer active' : ''}
              </p>
            </header>

            {data.user.role === 'crp' && data.schools.length > 0 && (
              <Link className="btn btn-secondary" to={`/handover?from=${data.user.id}`}>
                <Icon name="swap" small />
                Hand over all {plural(data.schools.length, 'school')}
              </Link>
            )}

            <section className="sec">
              <h2>
                Schools <span className="count">{data.schools.length}</span>
              </h2>
              {data.schools.length === 0 && <p className="hint">No schools assigned.</p>}
              <ul className="items">
                {data.schools.map((s) => (
                  <li key={s.id} className="assign">
                    <Link className="row-main" to={`/schools/${s.id}`}>
                      <span className="row-name name">{s.name}</span>
                      <span className="muted">
                        {s.lastVisitDate ? `Last visit ${shortDate(s.lastVisitDate, today)}` : 'Never visited'}
                        {s.openReminders ? `, ${plural(s.openReminders, 'reminder')}` : ''}
                      </span>
                    </Link>
                    {data.colleagues.length > 0 && (
                      <>
                        <label className="vh" htmlFor={`move-${s.id}`}>
                          Move {s.name} to
                        </label>
                        <select id={`move-${s.id}`} className="select" defaultValue="" onChange={(e) => move(s.id, e.target.value)}>
                          <option value="">Move to…</option>
                          {data.colleagues.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {problem && <p className="error-line">{problem}</p>}
            </section>

            {data.handovers.length > 0 && (
              <section className="sec">
                <h2>Handovers</h2>
                <ul className="rem-list">
                  {data.handovers.map((h) => (
                    <li key={h.id} className="rem">
                      <span className="rem-flag" aria-hidden="true">
                        <Icon name="swap" small />
                      </span>
                      <span>
                        <span className="rem-text">
                          {h.fromName} to {h.toName}, {shortDate(h.date, today)}
                        </span>
                        {h.note && <small>“{h.note}”</small>}
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
