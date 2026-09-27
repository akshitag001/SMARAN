import { firstName, parseDate, MONTHS_SHORT, ROLE_SHORT, type Draft, type Lang, type Session } from '@smaran/shared';

/** Plain text a mentor can paste into WhatsApp for the teacher, or have read aloud. */
export function feedbackText(opts: { teacher: string; date: string; draft: Pick<Draft, 'strength' | 'actions'>; lang: Lang; session: Session }): string {
  const { teacher, date, draft, lang, session } = opts;
  const d = parseDate(date);
  const day = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  const hi = lang === 'hi';
  const lines = [`Namaste ${firstName(teacher)} ji,`, '', hi ? `आज (${day}) की कक्षा के बारे में:` : `Notes from today's visit (${day}):`];
  if (draft.strength.trim()) lines.push('', (hi ? 'जो अच्छा रहा: ' : 'What worked: ') + draft.strength.trim());
  const actions = draft.actions.filter((a) => a.do.trim());
  if (actions.length) {
    lines.push('', hi ? 'आगे आज़माएँ:' : 'To try next:');
    for (const a of actions) lines.push(`- ${a.do.trim()}${a.how.trim() ? ' ' + a.how.trim() : ''}`);
  }
  const place = session.cluster?.name ?? `${session.block.name} block`;
  lines.push('', `${session.user.name}, ${ROLE_SHORT[session.user.role]}, ${place}`);
  return lines.join('\n');
}

/** The same feedback as one spoken passage, without the sign-off. */
export function spokenFeedback(teacher: string, draft: Pick<Draft, 'strength' | 'actions'>, lang: Lang): string {
  const hi = lang === 'hi';
  const parts = [`${firstName(teacher)} ji.`];
  if (draft.strength.trim()) parts.push((hi ? 'जो अच्छा रहा। ' : 'What worked. ') + draft.strength.trim());
  const actions = draft.actions.filter((a) => a.do.trim());
  if (actions.length) {
    parts.push(hi ? 'आगे आज़माएँ।' : 'To try next.');
    for (const a of actions) parts.push(`${a.do.trim()} ${a.how.trim()}`);
  }
  return parts.join(' ');
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}
