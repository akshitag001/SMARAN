import { useState } from 'react';
import { isoDate, type Pattern, type PatternsResponse } from '@smaran/shared';
import { Icon } from '../components/Icon';
import { Loading, Problem, StaleNote, TabBar, TabHeader } from '../components/ui';
import { problemText, put } from '../lib/api';
import { useData } from '../lib/useData';
import { useSync } from '../lib/sync';

/** Patterns across the cluster, in plain language, for the Block Resource Coordinator. */
export function Patterns() {
  const { data, error, loading, fromCache, reload } = useData<PatternsResponse>(`/patterns?date=${isoDate()}`);
  const { offline } = useSync();

  return (
    <>
      <TabHeader title="Patterns" />
      <main>
        {loading && !data && <Loading />}
        {error != null && !data && <Problem error={error} onRetry={reload} />}
        <StaleNote show={fromCache} />
        {data && (
          <>
            <div className="intro">
              <h1>Across {data.cluster.name.replace('Jan Shiksha Kendra ', '')} cluster</h1>
              <p>
                From {data.visitCount} visit notes in the last {data.periodDays} days across {data.schools.length} schools, compared with the{' '}
                {data.periodDays} days before. Edit the wording before it goes to the Block Education Officer.
              </p>
            </div>
            {data.patterns.length === 0 ? (
              <div className="empty-note">
                <b>No shared patterns yet</b>
                <span>A pattern appears here once the same issue is noted in two or more schools.</span>
              </div>
            ) : (
              <ul className="pats">
                {data.patterns.map((p) => (
                  <PatternItem key={p.theme} pattern={p} schools={data.schools} offline={offline} onSaved={reload} />
                ))}
              </ul>
            )}
          </>
        )}
      </main>
      <TabBar />
    </>
  );
}

function PatternItem({
  pattern: p,
  schools,
  offline,
  onSaved,
}: {
  pattern: Pattern;
  schools: { id: string; name: string }[];
  offline: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(p.title);
  const [body, setBody] = useState(p.body);
  const [problem, setProblem] = useState<string | null>(null);
  const names = schools.filter((s) => p.schoolIds.includes(s.id)).map((s) => s.name);

  const save = async () => {
    try {
      await put(`/patterns/${p.theme}`, { title, body });
      setEditing(false);
      setProblem(null);
      onSaved();
    } catch (err) {
      setProblem(problemText(err));
    }
  };

  return (
    <li className={`pat${p.kind === 'strength' ? ' good' : ''}`}>
      {editing ? (
        <>
          <label className="vh" htmlFor={`pt-${p.theme}`}>
            Pattern title
          </label>
          <textarea id={`pt-${p.theme}`} className="ruled do" rows={2} value={title} onChange={(e) => setTitle(e.target.value)} />
        </>
      ) : (
        <h2>{p.title}</h2>
      )}
      <div className="cells" aria-hidden="true">
        {schools.map((s) => (
          <i key={s.id} className={p.schoolIds.includes(s.id) ? 'on' : ''} />
        ))}
      </div>
      <p className="pat-meta">
        <span>
          <b>
            {p.count} of {schools.length} schools
          </b>
        </span>
        <span>{p.trend}</span>
        {p.edited && <span>Wording edited</span>}
      </p>
      {editing ? (
        <>
          <label className="vh" htmlFor={`pb-${p.theme}`}>
            Pattern description
          </label>
          <textarea id={`pb-${p.theme}`} className="ruled how" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        </>
      ) : (
        <p className="body">{p.body}</p>
      )}
      <details>
        <summary>Which schools</summary>
        <p>{names.join(', ')}</p>
      </details>
      {problem && <p className="error-line">{problem}</p>}
      {editing ? (
        <button className="edit" onClick={save}>
          <Icon name="check" small />
          Save wording
        </button>
      ) : (
        <button className="edit" onClick={() => setEditing(true)} disabled={offline} title={offline ? 'Needs signal' : undefined}>
          <Icon name="pen" small />
          Edit wording
        </button>
      )}
    </li>
  );
}
