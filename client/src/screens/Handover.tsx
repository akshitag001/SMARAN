import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ROLE_LABEL, isoDate, plural, type Handover as HandoverResult, type HandoverPreview, type Lang } from '@smaran/shared';
import { Icon } from '../components/Icon';
import { Loading, Problem, TopBar } from '../components/ui';
import { LangToggle, VoiceField } from '../components/voice';
import { getSession, post, problemText } from '../lib/api';
import { useData } from '../lib/useData';
import { useSync } from '../lib/sync';

type NewRole = '' | 'brc' | 'inactive';

/**
 * Hands a CRP's schools, open reminders and pending follow-ups to a colleague,
 * with a note for them. The coordinator can change the outgoing person's role
 * in the same step. Visit history stays with each school.
 */
export function Handover() {
  const [params] = useSearchParams();
  const session = getSession()!;
  const isBrc = session.user.role === 'brc';
  const from = params.get('from') ?? session.user.id;
  const preview = useData<HandoverPreview>(`/handover/preview?from=${from}`);
  const { offline, refreshUnread } = useSync();
  const navigate = useNavigate();

  const [to, setTo] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [lang, setLang] = useState<Lang>('en');
  const [newRole, setNewRole] = useState<NewRole>('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<HandoverResult | null>(null);

  const p = preview.data;
  const self = from === session.user.id;
  const target = p?.candidates.find((c) => c.id === to);

  const submit = async () => {
    if (!to) return;
    setBusy(true);
    setProblem(null);
    try {
      const result = await post<HandoverResult>(`/handovers?date=${isoDate()}`, {
        fromUserId: from,
        toUserId: to,
        note,
        ...(isBrc && newRole ? { newRole } : {}),
      });
      setDone(result);
      refreshUnread();
    } catch (err) {
      setProblem(problemText(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <>
        <header className="top" />
        <main>
          <section className="saved">
            <div className="stamp press" role="img" aria-label="Handover recorded">
              <span>Handed over</span>
              <strong>{plural(done.schoolCount, 'school')}</strong>
              <span>to {done.toName}</span>
            </div>
            <h1>{done.toName} now has {self ? 'your' : `${done.fromName}’s`} schools</h1>
            <p>
              {plural(done.schoolCount, 'school')} and {plural(done.reminderCount, 'open reminder')} moved. Each school keeps its full history, and{' '}
              {done.toName} will see your note on every brief.
            </p>
          </section>
        </main>
        <footer className="bar">
          <button className="btn btn-primary" onClick={() => navigate('/', { replace: true })}>
            Done
          </button>
        </footer>
      </>
    );
  }

  return (
    <>
      <TopBar back="Back" ruled />
      <main>
        {preview.loading && !p && <Loading />}
        {preview.error != null && !p && <Problem error={preview.error} onRetry={preview.reload} />}
        {p && (
          <>
            <header className="intro">
              <h1>{self ? 'Hand over your schools' : `Hand over ${p.from.name}’s schools`}</h1>
              <p>
                For a transfer, a new role or a long leave. The schools, their open reminders and the suggestions waiting to be checked move to a
                colleague. Each school keeps its full history.
              </p>
            </header>

            <dl className="ledger">
              <div>
                <dt>Schools</dt>
                <dd>{p.schools.length}</dd>
              </div>
              <div>
                <dt>Open reminders</dt>
                <dd>{p.openReminders}</dd>
              </div>
              <div>
                <dt>Suggestions waiting to be checked</dt>
                <dd>{p.pendingFollowUps}</dd>
              </div>
            </dl>
            {p.schools.length > 0 && (
              <details>
                <summary className="hint">Which schools</summary>
                <p className="hint">{p.schools.map((s) => s.name).join(', ')}</p>
              </details>
            )}

            {p.schools.length === 0 ? (
              <div className="empty-note">
                <b>No schools to hand over</b>
                <span>{self ? 'You have' : `${p.from.name} has`} no schools assigned.</span>
              </div>
            ) : p.candidates.length === 0 ? (
              <div className="empty-note">
                <b>No one to hand over to yet</b>
                <span>There is no other active CRP in the block. {isBrc ? 'Add one under People first.' : 'Ask your block coordinator to add one.'}</span>
              </div>
            ) : (
              <>
                <section className="sec">
                  <h2>Who takes over</h2>
                  <div className="pick" role="radiogroup" aria-label="Who takes over">
                    {p.candidates.map((c) => (
                      <button key={c.id} role="radio" aria-checked={to === c.id} className="pick-item" onClick={() => setTo(c.id)}>
                        <span className="pick-dot" aria-hidden="true" />
                        <span>
                          <b>{c.name}</b>
                          <small>{ROLE_LABEL[c.role]}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="sec">
                  <h2>Handover note</h2>
                  <p className="hint">What should {target ? target.firstName : 'they'} know? Teachers, pending issues, what’s working. Speak or type.</p>
                  <LangToggle lang={lang} onChange={setLang} />
                  <VoiceField
                    id="handover-note"
                    label="Handover note"
                    hideLabel
                    rows={4}
                    lang={lang}
                    value={note}
                    onChange={setNote}
                    placeholder="e.g. Kavita ji at Ratanpur responds well to demonstrations. Semri needs a follow-up on the hand pump."
                  />
                </section>

                {isBrc && (
                  <section className="sec">
                    <h2>{p.from.firstName}’s role after the handover</h2>
                    <div className="pick" role="radiogroup" aria-label="Role after the handover">
                      {(
                        [
                          ['', 'Stays a CRP'],
                          ['brc', 'Becomes Block Resource Coordinator'],
                          ['inactive', 'Leaves (transfer or retirement)'],
                        ] as [NewRole, string][]
                      ).map(([v, label]) => (
                        <button key={v || 'same'} role="radio" aria-checked={newRole === v} className="pick-item" onClick={() => setNewRole(v)}>
                          <span className="pick-dot" aria-hidden="true" />
                          <span>
                            <b>{label}</b>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
            {offline && <p className="error-line">A handover needs signal, so everyone sees the same thing at once.</p>}
            {problem && (
              <p className="error-line" role="alert">
                {problem}
              </p>
            )}
            {!self && (
              <p className="hint">
                <Link to={`/people/${from}`}>See {p.from.firstName}’s schools</Link>
              </p>
            )}
          </>
        )}
      </main>
      {p && p.schools.length > 0 && p.candidates.length > 0 && (
        <footer className="bar">
          <button className="btn btn-primary" disabled={!to || busy || offline} onClick={submit}>
            <Icon name="swap" small />
            {busy ? 'Handing over…' : target ? `Hand over to ${target.firstName}` : 'Choose who takes over'}
          </button>
        </footer>
      )}
    </>
  );
}
