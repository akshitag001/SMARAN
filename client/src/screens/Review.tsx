import { useEffect, useLayoutEffect, useRef, useState, type TextareaHTMLAttributes } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { STATE_LABEL, isoDate, shortDate, toneCheck, type BriefResponse, type CheckedState, type Draft } from '@smaran/shared';
import { Icon } from '../components/Icon';
import { Loading, Mark, Problem, Steps, TopBar } from '../components/ui';
import { getSession, problemText } from '../lib/api';
import { copyToClipboard, feedbackText } from '../lib/feedbackText';
import { useFlow } from '../lib/flow';
import { useBufferedValue } from '../lib/useBufferedValue';
import { useData } from '../lib/useData';
import { saveVisit } from '../lib/visits';

const SOURCE_TEXT = {
  ai: 'Drafted from your note with Claude.',
  local: 'Drafted on this phone from your note.',
  offline: 'No signal, so this was drafted on the phone from your note.',
  self: 'Written by you.',
} as const;

export function Review() {
  const { schoolId = '' } = useParams();
  const navigate = useNavigate();
  const { flow, update } = useFlow();
  const brief = useData<BriefResponse>(`/schools/${schoolId}/brief?date=${isoDate()}`);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const focusAction = useRef<number | null>(null);

  if (flow.schoolId !== schoolId) return <Navigate to={`/visit/${schoolId}`} replace />;
  if (!flow.draft) return <Navigate to={`/visit/${schoolId}/observe`} replace />;
  const draft = flow.draft;
  const setDraft = (patch: Partial<Draft>) => update({ draft: { ...draft, ...patch } });
  const setAction = (k: number, field: 'do' | 'how', value: string) =>
    setDraft({ actions: draft.actions.map((a, i) => (i === k ? { ...a, [field]: value } : a)) });

  const school = brief.data?.school;
  const lastVisit = brief.data?.lastVisit ?? null;
  const pending = lastVisit?.items.filter((i) => i.state === 'pending') ?? [];
  const session = getSession();
  const hasContent = draft.strength.trim() || draft.actions.some((a) => a.do.trim());

  const toggleCheck = (id: string, v: CheckedState) => {
    const checks = { ...flow.checks };
    if (checks[id] === v) delete checks[id];
    else checks[id] = v;
    update({ checks });
  };

  const save = async () => {
    if (!school || !session) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await saveVisit(flow, school, lastVisit, session.mentor);
      update({ saved });
      navigate(`/visit/${schoolId}/saved`, { replace: true });
    } catch (err) {
      setSaveError(`${problemText(err)} Your draft is still here.`);
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!school || !session) return;
    const ok = await copyToClipboard(
      feedbackText({ teacher: school.teacher, date: isoDate(), draft, lang: flow.lang, mentor: session.mentor, cluster: session.cluster }),
    );
    setToast(ok ? 'Copied. Paste it into WhatsApp.' : 'Copy isn’t available here. Select the text in the draft instead.');
    window.setTimeout(() => setToast(''), 3500);
  };

  return (
    <>
      <TopBar back="Note" backTo={`/visit/${schoolId}/observe`} ruled />
      <main>
        <Steps current={3} />
        {brief.loading && !brief.data && <Loading />}
        {brief.error != null && !brief.data && <Problem error={brief.error} onRetry={brief.reload} />}
        {school && (
          <div className="for">
            <span className="muted" style={{ fontSize: 15 }}>
              Feedback for
            </span>
            <span className="name">{school.teacher}</span>
            <p>
              {school.classLabel}, {school.subject}. {school.name}
            </p>
          </div>
        )}

        {lastVisit && pending.length > 0 && (
          <section className="fcheck">
            <h2>From {shortDate(lastVisit.date)}: what did you see today?</h2>
            {pending.map((i) => (
              <div className="fitem" key={i.id}>
                <p>{i.text}</p>
                <div className="choice" role="group" aria-label={i.text}>
                  {(['done', 'partly', 'notyet'] as const).map((v) => (
                    <button key={v} data-v={v} aria-pressed={flow.checks[i.id] === v} onClick={() => toggleCheck(i.id, v)}>
                      {STATE_LABEL[v]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="sheet" aria-label="Feedback draft">
          <p className="own">
            <b>Your draft. Change anything before saving.</b>
            <span>{flow.source ? SOURCE_TEXT[flow.source] : ''} Nothing reaches the teacher until you confirm.</span>
          </p>

          <label className="fl" htmlFor="f-strength">
            What worked
          </label>
          <RuledText id="f-strength" value={draft.strength} onChange={(v) => setDraft({ strength: v })} placeholder="One thing that went well in this class" />
          <ToneCue text={draft.strength} />

          <h3 className="fl">Try next</h3>
          <ul className="acts">
            {draft.actions.map((a, k) => (
              <li className="act" key={k}>
                <Mark state="pending" />
                <div>
                  <label className="vh" htmlFor={`f-do-${k}`}>
                    Suggestion {k + 1}
                  </label>
                  <RuledText
                    id={`f-do-${k}`}
                    className="do"
                    value={a.do}
                    onChange={(v) => setAction(k, 'do', v)}
                    placeholder="What to try"
                    autoFocus={focusAction.current === k}
                  />
                  <label className="vh" htmlFor={`f-how-${k}`}>
                    How
                  </label>
                  <RuledText id={`f-how-${k}`} className="how" value={a.how} onChange={(v) => setAction(k, 'how', v)} placeholder="How, in the classroom" />
                </div>
                <button
                  className="act-x"
                  aria-label={`Remove suggestion ${k + 1}`}
                  onClick={() => {
                    const rest = draft.actions.filter((_, i) => i !== k);
                    setDraft({ actions: rest.length ? rest : [{ do: '', how: '' }] });
                  }}
                >
                  <Icon name="x" small />
                </button>
                <div className="cue-slot">
                  <ToneCue text={`${a.do} ${a.how}`} />
                </div>
              </li>
            ))}
          </ul>
          {draft.actions.length < 3 && (
            <button
              className="add"
              onClick={() => {
                focusAction.current = draft.actions.length;
                setDraft({ actions: [...draft.actions, { do: '', how: '' }] });
              }}
            >
              <Icon name="plus" small />
              Add a suggestion
            </button>
          )}
          <p className="carry">
            <Mark state="pending" />
            <span>Checked at the next visit, whoever makes it.</span>
          </p>

          <label className="fl" htmlFor="f-summary">
            Line for the school record
          </label>
          <RuledText id="f-summary" value={draft.summary} onChange={(v) => setDraft({ summary: v })} placeholder="One line on what you saw" />
          <ToneCue text={draft.summary} />
        </section>

        <div className="tools">
          <button onClick={() => navigate(`/visit/${schoolId}/drafting`)}>
            <Icon name="redo" small />
            Redraft from note
          </button>
          <button onClick={copy}>
            <Icon name="copy" small />
            Copy for WhatsApp
          </button>
        </div>
        <p className="toast" aria-live="polite">
          {toast}
        </p>
        <details className="raw">
          <summary>Your original note</summary>
          <p>{flow.note}</p>
        </details>
        {saveError && (
          <p className="error-line" role="alert">
            {saveError}
          </p>
        )}
      </main>
      <footer className="bar">
        <button className="btn btn-primary" onClick={save} disabled={saving || !school || !hasContent}>
          {saving ? 'Saving…' : 'Confirm and save'}
        </button>
      </footer>
    </>
  );
}

/** A textarea on register rules that grows with its text. */
function RuledText({
  value,
  onChange,
  className = '',
  ...props
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useBufferedValue(value, onChange);
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
  }, [text]);
  return <textarea ref={ref} rows={1} className={`ruled ${className}`} value={text} onChange={(e) => setText(e.target.value)} {...props} />;
}

/** A calm nudge once the mentor pauses typing; never blocks saving. */
function ToneCue({ text }: { text: string }) {
  const [settled, setSettled] = useState(text);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(text), 500);
    return () => window.clearTimeout(id);
  }, [text]);
  const cue = toneCheck(settled);
  return cue ? <div className="cue">{cue.message}</div> : null;
}
