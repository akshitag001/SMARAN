import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '@smaran/shared';

// The Web Speech API isn't in TypeScript's DOM types yet; this is the part we use.
interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type SpeechProblem = 'unsupported' | 'denied' | 'no-signal' | null;

/**
 * Voice to text in Hindi (hi-IN) or Indian English (en-IN).
 * `onText` receives the whole transcript for this recording so far.
 */
export function useSpeech(lang: Lang, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<SpeechProblem>(recognitionCtor() ? null : 'unsupported');
  const rec = useRef<Recognition | null>(null);
  const wanted = useRef(false);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const stop = useCallback(() => {
    wanted.current = false;
    rec.current?.stop();
    rec.current = null;
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setProblem('unsupported');
      return false;
    }
    const r = new Ctor();
    r.lang = lang === 'hi' ? 'hi-IN' : 'en-IN';
    r.continuous = true;
    r.interimResults = true;
    let finalText = '';
    r.onresult = (e) => {
      let interim = '';
      finalText = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript + ' ';
        else interim += res[0].transcript;
      }
      onTextRef.current((finalText + interim).trim());
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') setProblem('denied');
      else if (e.error === 'network') setProblem('no-signal');
      else return;
      stop();
    };
    // Browsers end recognition after a pause; keep listening until the mentor taps stop.
    r.onend = () => {
      if (wanted.current && rec.current === r) {
        try {
          r.start();
        } catch {
          stop();
        }
      }
    };
    try {
      r.start();
    } catch {
      setProblem('unsupported');
      return false;
    }
    rec.current = r;
    wanted.current = true;
    setProblem(null);
    setListening(true);
    return true;
  }, [lang, stop]);

  useEffect(() => () => {
    wanted.current = false;
    rec.current?.abort();
  }, []);

  return { listening, problem, start, stop, supported: recognitionCtor() !== null };
}
