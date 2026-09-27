import { useState } from 'react';
import {
  MONTHS_SHORT,
  RESPONSE_LABEL,
  STATE_LABEL,
  isoDate,
  parseDate,
  shortDate,
  type Lang,
  type ResponseStatus,
  type Suggestion,
  type TeacherHomeResponse,
  type Visit,
} from '@smaran/shared';
import { ThumbRow } from '../components/photos';
import { Loading, Mark, Problem, StaleNote, TabBar, TabHeader, TeacherReplies } from '../components/ui';
import { LangToggle, ReadAloudButton, VoiceField } from '../components/voice';
import { getSession, newClientId, problemText } from '../lib/api';
import { postOrQueue } from '../lib/outbox';
import { spokenFeedback } from '../lib/feedbackText';
import { useData } from '../lib/useData';

/**
 * The teacher's side: every visit's feedback, newest first. For each suggestion
 * the teacher can say they're trying it, it's done, or they need help, by voice
 * or typing. Their CRP sees it before the next visit.
 */
export function TeacherHome() {
  const { data, error, loading, fromCache, reload } = useData<TeacherHomeResponse>('/teacher/home');
  const me = getSession()!.user;
  const [lang, setLang] = useState<Lang>('hi');

  return (
    <>
      <TabHeader />
      <main>
        <div className="greet">
          <h1>Namaste, {me.firstName} ji</h1>
          {data && (
            <p>
              {data.school.name}, {data.school.classLabel} {data.school.subject}
            </p>
          )}
        </div>
        {loading && !data && <Loading />}
        {error != null && !data && <Problem error={error} onRetry={reload} />}
        <StaleNote show={fromCache} />
        {data && data.visits.length === 0 && (
          <div className="empty-note">
            <b>No visits yet</b>
            <span>Feedback from your CRP’s visits will appear here.</span>
          </div>
        )}
        {data && data.visits.length > 0 && (
          <>
            <p className="hint">Tell your CRP how each suggestion is going. They see it before their next visit.</p>
            <LangToggle lang={lang} onChange={setLang} />
            {data.visits.map((v) => (
              <VisitCard key={v.id} visit={v} teacher={data.school.teacher} lang={lang} onReplied={reload} />
            ))}
          </>
        )}
      </main>
      <TabBar />
    </>
  );
}

function VisitCard({ visit: v, teacher, lang, onReplied }: { visit: Visit; teacher: string; lang: Lang; onReplied: () => void }) {
  const d = parseDate(v.date);
  const open = v.items.some((i) => i.state === 'pending');
  return (
    <article className={`tvisit${open ? ' open' : ''}`}>
      <header>
        <span className="tl-date">
          <b>{d.getDate()}</b>
          <span>
            {MONTHS_SHORT[d.getMonth()]} {d.getFullYear()}
          </span>
        </span>
        <span>
          <b>Visit by {v.mentorName}</b>
          <span className="muted">{v.summary}</span>
        </span>
      </header>
      {v.strength && (
        <p className="tstrength">
          <span className="fl">What worked</span>
          {v.strength}
        </p>
      )}
      {v.items.length > 0 && <span className="fl">Suggestions</span>}
      <ul className="tl-items">
        {v.items.map((i) => (
          <SuggestionReply key={i.id} item={i} lang={lang} onReplied={onReplied} />
        ))}
      </ul>
      <ThumbRow photos={v.photos} />
      <div className="tools" style={{ marginTop: 0 }}>
        <ReadAloudButton text={spokenFeedback(teacher, { strength: v.strength, actions: v.items.map((i) => ({ do: i.text, how: i.how })) }, lang)} lang={lang} />
      </div>
    </article>
  );
}

function SuggestionReply({ item: i, lang, onReplied }: { item: Suggestion; lang: Lang; onReplied: () => void }) {
  const [status, setStatus] = useState<ResponseStatus | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const today = isoDate();

  const send = async () => {
    if (!status) return;
    setBusy(true);
    setMsg(null);
    try {
      const sent = await postOrQueue('Reply', `/suggestions/${i.id}/responses`, { clientId: newClientId(), status, note });
      setStatus(null);
      setNote('');
      setMsg(sent ? 'Sent to your CRP.' : 'Saved on this phone. It will be sent when there is signal.');
      if (sent) onReplied();
    } catch (err) {
      setMsg(problemText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="treply">
      <Mark state={i.state} />
      <span>
        <b className="t-do">{i.text}</b>
        {i.how && <span className="t-how">{i.how}</span>}
        <small>
          {i.state === 'pending' ? 'Your CRP will look for this at the next visit' : `${STATE_LABEL[i.state]}${i.checkedOn ? `, seen ${shortDate(i.checkedOn, today)}` : ''}`}
        </small>
        <TeacherReplies responses={i.responses} />
        {i.state === 'pending' && (
          <>
            <div className="choice" role="group" aria-label={`How is it going: ${i.text}`}>
              {(['trying', 'done', 'help'] as const).map((s) => (
                <button key={s} data-v={s === 'done' ? 'done' : s === 'trying' ? 'partly' : 'notyet'} aria-pressed={status === s} onClick={() => setStatus(status === s ? null : s)}>
                  {RESPONSE_LABEL[s]}
                </button>
              ))}
            </div>
            {status && (
              <div className="reply-form">
                <VoiceField
                  id={`reply-${i.id}`}
                  label={status === 'help' ? 'What help do you need?' : 'Anything to add? (optional)'}
                  rows={2}
                  lang={lang}
                  value={note}
                  onChange={setNote}
                  placeholder={status === 'help' ? 'e.g. We only have 20 slates for 38 children' : 'e.g. The back rows answer more now'}
                />
                <button className="btn btn-primary" onClick={send} disabled={busy || (status === 'help' && note.trim().length < 3)}>
                  {busy ? 'Sending…' : 'Send to my CRP'}
                </button>
              </div>
            )}
          </>
        )}
        {msg && <p className="toast">{msg}</p>}
      </span>
    </li>
  );
}
