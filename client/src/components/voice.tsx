import { useLayoutEffect, useRef, useState } from 'react';
import type { Lang } from '@smaran/shared';
import { useSpeech } from '../lib/speech';
import { langOf, useReadAloud } from '../lib/readAloud';
import { useBufferedValue } from '../lib/useBufferedValue';
import { Icon } from './Icon';

/**
 * A text field with a microphone: tap to speak, tap again to stop. What is said is
 * added after what's already there, and stays editable. Falls back to typing where
 * the browser has no voice typing.
 */
export function VoiceField({
  id,
  label,
  value,
  onChange,
  lang,
  placeholder,
  rows = 2,
  hideLabel,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  lang: Lang;
  placeholder?: string;
  rows?: number;
  hideLabel?: boolean;
}) {
  const [text, setText] = useBufferedValue(value, onChange);
  const base = useRef('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeech(lang, (heard) => setText((base.current + ' ' + heard).trim()));

  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${t.scrollHeight}px`;
  }, [text]);

  const toggle = () => {
    if (speech.listening) return speech.stop();
    base.current = text;
    speech.start();
  };

  return (
    <div className="vfield">
      <label htmlFor={id} className={hideLabel ? 'vh' : 'vfield-label'}>
        {label}
      </label>
      <div className={`vfield-box${speech.listening ? ' on' : ''}`}>
        <textarea id={id} ref={ref} rows={rows} value={text} readOnly={speech.listening} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
        {speech.supported && (
          <button type="button" className="vfield-mic" onClick={toggle} aria-label={speech.listening ? 'Stop dictating' : `Speak ${label.toLowerCase()}`} aria-pressed={speech.listening}>
            <Icon name={speech.listening ? 'stop' : 'mic'} small />
          </button>
        )}
      </div>
      {speech.listening && <p className="vfield-hint">Listening. Tap the square to stop.</p>}
      {speech.problem === 'denied' && <p className="vfield-hint">Allow the microphone in the browser settings to speak instead of typing.</p>}
    </div>
  );
}

/** Reads a piece of feedback aloud, for sharing it with a teacher face to face. */
export function ReadAloudButton({ text, lang }: { text: string; lang?: Lang }) {
  const { supported, speaking, speak, stop } = useReadAloud();
  if (!supported) return null;
  return (
    <button type="button" className="chipbtn" onClick={() => (speaking ? stop() : speak(text, lang ?? langOf(text)))} aria-pressed={speaking}>
      <Icon name={speaking ? 'stop' : 'speaker'} small />
      {speaking ? 'Stop reading' : 'Read aloud'}
    </button>
  );
}

/** Small toggle between Hindi and English for voice input. */
export function LangToggle({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  const [id] = useState(() => `lang-${Math.random().toString(36).slice(2, 7)}`);
  return (
    <div className="lang">
      <span id={id}>Speaking in</span>
      <span className="seg" role="group" aria-labelledby={id}>
        <button type="button" aria-pressed={lang === 'en'} onClick={() => onChange('en')}>
          English
        </button>
        <button type="button" aria-pressed={lang === 'hi'} onClick={() => onChange('hi')} lang="hi">
          हिन्दी
        </button>
      </span>
    </div>
  );
}
