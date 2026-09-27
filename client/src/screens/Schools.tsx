import { useState } from 'react';
import { Link } from 'react-router';
import { isoDate, plural, shortDate, withoutHonorific, type SchoolSummary } from '@smaran/shared';
import { Icon } from '../components/Icon';
import { Loading, Problem, StaleNote, TabBar, TabHeader } from '../components/ui';
import { getSession } from '../lib/api';
import { useData } from '../lib/useData';

const sortName = (name: string) => name.replace(/^\w+ /, '');

export function Schools() {
  const today = isoDate();
  const session = getSession();
  const isCrp = session?.user.role === 'crp';
  const { data, error, loading, fromCache, reload } = useData<SchoolSummary[]>(`/schools?date=${today}`);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<string>(isCrp ? 'mine' : 'all');

  const clusters = [...new Set((data ?? []).map((s) => s.clusterId))];
  const query = q.trim().toLowerCase();
  const list = (data ?? [])
    .filter((s) => {
      if (filter === 'mine') return s.mentorId === session?.user.id;
      if (filter === 'unassigned') return !s.mentorId;
      if (filter !== 'all') return s.clusterId === filter;
      return true;
    })
    .filter((s) => !query || `${s.name} ${s.teacher} ${s.village} ${s.udise} ${s.mentorName ?? ''}`.toLowerCase().includes(query))
    .sort((a, b) => sortName(a.name).localeCompare(sortName(b.name)));

  const options: [string, string][] = isCrp
    ? [['mine', 'My schools'], ['all', 'Whole block']]
    : [['all', 'All'], ...clusters.map((c): [string, string] => [c, clusterLabel(c)]), ['unassigned', 'No CRP']];

  return (
    <>
      <TabHeader title="Schools" />
      <main>
        <div className="stack">
          <label className="vh" htmlFor="search">
            Search schools or teachers
          </label>
          <input id="search" className="search" type="search" placeholder="Search school, teacher, UDISE or CRP" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          <div className="scope" role="group" aria-label="Show">
            {options.map(([v, label]) => (
              <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {loading && !data && <Loading />}
        {error != null && !data && <Problem error={error} onRetry={reload} />}
        <StaleNote show={fromCache} />
        {data && (
          <ul className="slist">
            {list.length === 0 && <li style={{ padding: '18px 0', color: 'var(--ink-3)' }}>No schools match.</li>}
            {list.map((s) => (
              <li key={s.id}>
                <Link className="row" to={`/schools/${s.id}`}>
                  <span className="row-main">
                    <span className="row-name name">{s.name}</span>
                    <span className="row-meta">
                      {withoutHonorific(s.teacher)}, {s.classLabel.replace(/ \(multigrade\)/, '')} {s.subject}
                    </span>
                    <span className="row-foot">
                      <span className="muted">
                        {s.visitedToday ? 'Visited today' : s.lastVisitDate ? `Last visit ${shortDate(s.lastVisitDate, today)}` : 'No visits yet'}
                      </span>
                      {filter !== 'mine' && <span className="muted">{s.mentorName ? `CRP ${s.mentorName}` : 'No CRP'}</span>}
                      {s.openCount > 0 && <span className="chip chip-plain">{plural(s.openCount, 'suggestion')} open</span>}
                      {s.openReminders > 0 && <span className="chip chip-look">{plural(s.openReminders, 'reminder')}</span>}
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

// Cluster ids are short village names; show them capitalised.
const clusterLabel = (id: string) => id.charAt(0).toUpperCase() + id.slice(1);
