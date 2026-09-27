import { useState } from 'react';
import { Link } from 'react-router';
import { isoDate, plural, shortDate, withoutHonorific, type SchoolSummary } from '@smaran/shared';
import { Icon } from '../components/Icon';
import { Loading, Problem, StaleNote, TabBar, TabHeader } from '../components/ui';
import { useData } from '../lib/useData';

const sortName = (name: string) => name.replace(/^\w+ /, '');

export function Schools() {
  const today = isoDate();
  const { data, error, loading, fromCache, reload } = useData<SchoolSummary[]>(`/schools?date=${today}`);
  const [q, setQ] = useState('');

  const query = q.trim().toLowerCase();
  const list = (data ?? [])
    .filter((s) => !query || `${s.name} ${s.teacher} ${s.village} ${s.udise}`.toLowerCase().includes(query))
    .sort((a, b) => sortName(a.name).localeCompare(sortName(b.name)));

  return (
    <>
      <TabHeader title="Schools" />
      <main>
        <div>
          <label className="vh" htmlFor="search">
            Search schools or teachers
          </label>
          <input id="search" className="search" type="search" placeholder="Search school, teacher or UDISE" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </div>
        {loading && !data && <Loading />}
        {error != null && !data && <Problem error={error} onRetry={reload} />}
        <StaleNote show={fromCache} />
        {data && (
          <ul className="slist">
            {list.length === 0 && <li style={{ padding: '18px 0', color: 'var(--ink-3)' }}>No school or teacher matches “{q}”.</li>}
            {list.map((s) => (
              <li key={s.id}>
                <Link className="row" to={`/schools/${s.id}`}>
                  <span className="row-main">
                    <span className="row-name name">{s.name}</span>
                    <span className="row-meta">
                      {withoutHonorific(s.teacher)}, {s.classLabel.replace(' (multigrade)', '')} {s.subject}
                    </span>
                    <span className="row-foot">
                      <span className="muted">
                        {s.visitedToday ? 'Visited today' : s.lastVisitDate ? `Last visit ${shortDate(s.lastVisitDate, today)}` : 'No visits yet'}
                      </span>
                      {s.openCount > 0 && <span className="chip chip-plain">{plural(s.openCount, 'suggestion')} open</span>}
                    </span>
                  </span>
                  <Icon name="chev" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <TabBar />
    </>
  );
}
