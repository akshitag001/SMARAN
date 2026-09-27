import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { ROLE_LABEL, plural, type PeopleResponse, type Person, type Role, type User } from '@smaran/shared';
import { Icon } from '../components/Icon';
import { Loading, Problem, StaleNote, TabBar, TabHeader, useToast } from '../components/ui';
import { ApiError, patch, post, problemText } from '../lib/api';
import { useData } from '../lib/useData';

const GROUPS: [Role, string][] = [
  ['crp', 'Cluster Resource Persons'],
  ['brc', 'Block coordinators'],
  ['teacher', 'Teachers'],
];

/** Everyone in the block: add people, change roles, and see who needs a handover first. */
export function People() {
  const { data, error, loading, fromCache, reload } = useData<PeopleResponse>('/people');
  const [toast, showToast] = useToast();

  return (
    <>
      <TabHeader title="People" />
      <main>
        {loading && !data && <Loading />}
        {error != null && !data && <Problem error={error} onRetry={reload} />}
        <StaleNote show={fromCache} />
        {data && (
          <>
            <AddPerson data={data} onAdded={(u) => (reload(), showToast(`${u.name} can now sign in.`))} />
            {toast && <p className="toast">{toast}</p>}
            {GROUPS.map(([role, label]) => {
              const people = data.people.filter((p) => p.role === role);
              if (!people.length) return null;
              return (
                <section className="sec" key={role}>
                  <h2>
                    {label} <span className="count">{people.length}</span>
                  </h2>
                  <ul className="people">
                    {people.map((p) => (
                      <PersonRow key={p.id} person={p} data={data} onChanged={reload} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </>
        )}
      </main>
      <TabBar />
    </>
  );
}

function PersonRow({ person: p, data, onChanged }: { person: Person; data: PeopleResponse; onChanged: () => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  const navigate = useNavigate();
  const where =
    p.role === 'teacher'
      ? data.schools.find((s) => s.id === p.schoolId)?.name
      : p.role === 'crp'
        ? data.clusters.find((c) => c.id === p.clusterId)?.name.replace('Jan Shiksha Kendra ', '')
        : null;

  const change = async (body: { role?: Role; active?: boolean }) => {
    setProblem(null);
    try {
      await patch(`/people/${p.id}`, body);
      onChanged();
    } catch (err) {
      // A CRP with schools needs a handover first; offer it.
      if (err instanceof ApiError && err.status === 409) setProblem(err.message);
      else setProblem(problemText(err));
    }
  };

  return (
    <li className={`person${p.active ? '' : ' inactive'}`}>
      <div className="person-main">
        {p.role === 'crp' ? (
          <Link to={`/people/${p.id}`}>
            <b>{p.name}</b>
          </Link>
        ) : (
          <b>{p.name}</b>
        )}
        <span className="muted num">
          {p.phone.replace(/^(\d{5})(\d{5})$/, '$1 $2')}
          {where ? `, ${where}` : ''}
          {p.role === 'crp' ? `, ${plural(p.schoolCount, 'school')}` : ''}
          {!p.active ? ', no longer active' : ''}
        </span>
      </div>
      <div className="person-actions">
        <label className="vh" htmlFor={`role-${p.id}`}>
          Role for {p.name}
        </label>
        <select id={`role-${p.id}`} className="select" value={p.role} onChange={(e) => change({ role: e.target.value as Role })}>
          {GROUPS.map(([r]) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <button className="linkbtn" onClick={() => change({ active: !p.active })}>
          {p.active ? 'Deactivate' : 'Reactivate'}
        </button>
      </div>
      {problem && (
        <div className="error-line" role="alert">
          {problem}{' '}
          {p.schoolCount > 0 && (
            <button className="linkbtn" onClick={() => navigate(`/handover?from=${p.id}`)}>
              Hand over now
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function AddPerson({ data, onAdded }: { data: PeopleResponse; onAdded: (u: User) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<Role>('teacher');
  const [clusterId, setClusterId] = useState(data.clusters[0]?.id ?? '');
  const [schoolId, setSchoolId] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const u = await post<User>('/people', {
        name,
        phone: phone.replace(/\D/g, ''),
        pin,
        role,
        clusterId: role === 'crp' ? clusterId : null,
        schoolId: role === 'teacher' ? schoolId : null,
      });
      setName('');
      setPhone('');
      setPin('');
      setOpen(false);
      onAdded(u);
    } catch (err) {
      setProblem(problemText(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="btn btn-secondary" onClick={() => setOpen(true)}>
        <Icon name="plus" small />
        Add a person
      </button>
    );
  }

  return (
    <form className="form card-form" onSubmit={submit}>
      <h2>Add a person</h2>
      <div className="field">
        <label htmlFor="p-name">Full name</label>
        <input id="p-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={3} placeholder="e.g. Smt. Pooja Meena" />
      </div>
      <div className="field">
        <label htmlFor="p-phone">Mobile number</label>
        <input id="p-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="p-pin">First PIN</label>
        <input id="p-pin" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} required pattern="\d{4,6}" />
        <span className="hint">4 to 6 digits. Share it with them in person.</span>
      </div>
      <div className="field">
        <span className="vfield-label">Role</span>
        <div className="scope" role="radiogroup" aria-label="Role">
          {GROUPS.map(([r]) => (
            <button type="button" key={r} role="radio" aria-checked={role === r} aria-pressed={role === r} onClick={() => setRole(r)}>
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
      {role === 'crp' && (
        <div className="field">
          <label htmlFor="p-cluster">Cluster</label>
          <select id="p-cluster" className="select" value={clusterId} onChange={(e) => setClusterId(e.target.value)}>
            {data.clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {role === 'teacher' && (
        <div className="field">
          <label htmlFor="p-school">School</label>
          <select id="p-school" className="select" value={schoolId} onChange={(e) => setSchoolId(e.target.value)} required>
            <option value="">Choose the school…</option>
            {data.schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {problem && <p className="error-line">{problem}</p>}
      <button className="btn btn-primary" disabled={busy}>
        {busy ? 'Adding…' : 'Add'}
      </button>
      <button type="button" className="btn btn-text" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}
