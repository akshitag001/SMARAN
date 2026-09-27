import { firstName, parseDate, MONTHS_SHORT, type Draft, type Lang, type Mentor, type Cluster } from '@smaran/shared';

/** Plain text a mentor can paste into WhatsApp for the teacher. */
export function feedbackText(opts: { teacher: string; date: string; draft: Draft; lang: Lang; mentor: Mentor; cluster: Cluster }): string {
  const { teacher, date, draft, lang, mentor, cluster } = opts;
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
  lines.push('', `${mentor.name}, ${mentor.role}, ${cluster.name}`);
  return lines.join('\n');
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
