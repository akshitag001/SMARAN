import { THEMES } from './themes';
import type { Draft, Lang } from './types';

const POSITIVE = /(good|well|nice|excited|attentive|cheerful|progress|improvement|clear|अच्छ|सुधार|ध्यान से)/i;
const NEGATIVE = /\b(but|not|didn.?t|no)\b|नहीं|लेकिन/i;

/**
 * Drafts feedback from a raw note without any network: spots up to two themes
 * in the order the mentor mentioned them, and lifts positive sentences into
 * "what worked". Used on the phone when there is no signal, and on the server
 * when Claude is not configured or unavailable.
 */
export function localDraft(note: string, lang: Lang): Draft {
  const text = note.trim();
  const hits = THEMES.filter((t) => t.kind === 'concern' && t.observe && t.action)
    .map((t) => {
      const m = text.match(t.observe!);
      return m ? { t, at: m.index ?? 0 } : null;
    })
    .filter((h): h is NonNullable<typeof h> => h !== null)
    .sort((a, b) => a.at - b.at)
    .slice(0, 2);

  const actions = hits.length
    ? hits.map((h) => ({ ...h.t.action![lang] }))
    : [
        lang === 'hi'
          ? { do: 'कल की कक्षा में एक पल चुनें जब आप देखें कि किसे समझ आया।', how: 'एक छोटा सवाल पूछें और सबसे एक साथ स्लेट पर जवाब दिखवाएँ।' }
          : { do: 'Pick one moment in tomorrow’s lesson to check who has understood.', how: 'Ask one short question and have every child show the answer on a slate at the same time.' },
      ];

  const sentences = text
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const good = sentences.filter((s) => POSITIVE.test(s) && !NEGATIVE.test(s)).slice(0, 2);
  const strength = good.length ? (lang === 'hi' ? 'मैंने देखा: ' : 'I noticed: ') + good.join(' ') : '';

  const topic = (sentences[0] ?? '').replace(/[.।]$/, '');
  const lead = topic && topic.length < 80 ? topic + '. ' : '';
  const suggested = actions.map((a) => lowerFirst(a.do.replace(/[.।]$/, ''))).join('; ');
  const summary = lead + (lang === 'hi' ? 'सुझाव: ' : 'Suggested: ') + suggested + '.';

  return { strength, actions, summary: upperFirst(summary) };
}

const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
