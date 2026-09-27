import { useEffect, useRef } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { isoDate, type BriefResponse, type Lang } from '@smaran/shared';
import { Icon } from '../components/Icon';
import { Steps, TopBar } from '../components/ui';
import { Waveform } from '../components/Waveform';
import { useFlow } from '../lib/flow';
import { useSpeech } from '../lib/speech';
import { useBufferedValue } from '../lib/useBufferedValue';
import { useData } from '../lib/useData';
import { useSync } from '../lib/sync';

const PROBLEM_TEXT = {
  unsupported: 'Voice typing isn’t available in this browser. Type your note instead, or open Smaran in Chrome.',
  denied: 'Smaran can’t use the microphone. Allow microphone access in the browser settings, or type your note.',
  'no-signal': 'Voice typing needs signal. Type your note for now; it is saved on this phone.',
} as const;

export function Observe() {
  const { schoolId = '' } = useParams();
  const navigate = useNavigate();
  const { flow, update } = useFlow();
  const { offline } = useSync();
  const { data } = useData<BriefResponse>(`/schools/${schoolId}/brief?date=${isoDate()}`);
  const base = useRef('');
  const startedAt = useRef(0);
  const timer = useRef<HTMLSpanElement>(null);
  const noteBox = useRef<HTMLTextAreaElement>(null);

  const [note, setNote] = useBufferedValue(flow.note, (v) => update({ note: v }));

  const speech = useSpeech(flow.lang, (text) => {
    update({ note: (base.current + ' ' + text).trim() });
  });

  // Tick the recording timer without re-rendering the screen.
  useEffect(() => {
    if (!speech.listening) return;
    const id = window.setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000);
      if (timer.current) timer.current.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 250);
    return () => window.clearInterval(id);
  }, [speech.listening]);

  // Voice typing can't work here: fall back to the keyboard.
  useEffect(() => {
    if (speech.problem && !flow.typing) update({ typing: true });
  }, [speech.problem, flow.typing, update]);

  useEffect(() => {
    const t = noteBox.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.max(120, t.scrollHeight)}px`;
  }, [note]);

  if (flow.schoolId !== schoolId) return <Navigate to={`/visit/${schoolId}`} replace />;

  const toggleRecording = () => {
    if (speech.listening) {
      speech.stop();
      return;
    }
    base.current = flow.note;
    startedAt.current = Date.now();
    if (timer.current) timer.current.textContent = '0:00';
    speech.start();
  };

  const setLang = (lang: Lang) => {
    if (speech.listening) speech.stop();
    update({ lang });
  };

  const canDraft = !speech.listening && flow.note.trim().length >= 12;
  const pending = data?.lastVisit?.items.filter((i) => i.state === 'pending') ?? [];
  const showVoice = !flow.typing && !offline;

  return (
    <>
      <TopBar back="Brief" backTo={`/visit/${schoolId}`} />
      <main>
        <Steps current={2} />
        {data && (
          <p className="who-line">
            <span className="name">{data.school.teacher}</span>, {data.school.classLabel} {data.school.subject}
          </p>
        )}
        {pending.length > 0 && (
          <div className="lookfor">
            <b>Look for</b>
            <ul>
              {pending.map((i) => (
                <li key={i.id}>{i.text}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="lang">
          <span id="lang-l">Speaking in</span>
          <span className="seg" role="group" aria-labelledby="lang-l">
            <button aria-pressed={flow.lang === 'en'} onClick={() => setLang('en')}>
              English
            </button>
            <button aria-pressed={flow.lang === 'hi'} onClick={() => setLang('hi')} lang="hi">
              हिन्दी
            </button>
          </span>
        </div>

        {showVoice && (
          <section className="capture" aria-label="Voice note">
            <Waveform active={speech.listening} />
            <button
              className={`rec${speech.listening ? ' on' : ''}`}
              onClick={toggleRecording}
              aria-label={speech.listening ? 'Stop recording' : 'Start recording'}
            >
              <Icon name={speech.listening ? 'stop' : 'mic'} />
            </button>
            <p className="rec-status" aria-live="polite">
              {speech.listening ? (
                <>
                  Listening <span className="num" ref={timer}>0:00</span>
                </>
              ) : flow.note ? (
                'Tap to add more'
              ) : (
                'Tap and speak'
              )}
            </p>
            <p className="rec-hint">{speech.listening ? 'Tap again to stop.' : 'Say it as you would to a colleague. Rough is fine.'}</p>
          </section>
        )}

        {speech.problem && <p className="error-line">{PROBLEM_TEXT[speech.problem]}</p>}
        {offline && !speech.problem && <p className="error-line">No signal, so voice typing is off. Type your note; it is kept on this phone.</p>}

        {(flow.note || !showVoice) && (
          <div className="notebox">
            <label htmlFor="note">
              <span>{showVoice ? 'Your note' : 'Type your observation'}</span>
              {showVoice && (
                <span className="muted" style={{ fontWeight: 400 }}>
                  You can correct it
                </span>
              )}
            </label>
            <textarea
              id="note"
              ref={noteBox}
              readOnly={speech.listening}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. taught addition, only 2 strong kids answered, teacher rushed the examples"
              autoFocus={!showVoice}
            />
          </div>
        )}

        {!offline && speech.supported && (
          <div className="alt">
            <button
              className="btn-text"
              style={{ padding: '0 12px', borderRadius: 10, display: 'inline-flex', alignItems: 'center', gap: 8 }}
              onClick={() => {
                if (speech.listening) speech.stop();
                update({ typing: !flow.typing });
              }}
            >
              <Icon name={flow.typing ? 'mic' : 'kb'} small />
              {flow.typing ? 'Speak instead' : 'Type instead, for noisy rooms'}
            </button>
          </div>
        )}
      </main>
      <footer className="bar">
        <button className="btn btn-primary" disabled={!canDraft} onClick={() => navigate(`/visit/${schoolId}/drafting`)}>
          Draft feedback
        </button>
      </footer>
    </>
  );
}
