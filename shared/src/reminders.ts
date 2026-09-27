/**
 * Finds "next time…" reminders in a mentor's note, in English or Hindi.
 *   "Next time check if the library register is filled."  → "Check if the library register is filled"
 *   "Remind me to ask about the hand pump."               → "Ask about the hand pump"
 *   "अगली बार पुस्तकालय रजिस्टर देखना है।"                     → "पुस्तकालय रजिस्टर देखना है"
 */
const CUES: RegExp[] = [
  /\b(?:next time|next visit|on the next visit|during the next visit|at the next visit)\b[,:]?\s*(?:i (?:should|must|need to|will|want to)\s+|we (?:should|must|need to)\s+|(?:need|have) to\s+|please\s+|remember to\s+)?(.+)/i,
  /\bremind (?:me|us)(?: next time)? to\s+(.+)/i,
  /\breminder[:\-]\s*(.+)/i,
  /\b(?:follow up on|follow-up on|follow up with)\s+(.+?)(?:\s+next time)?$/i,
  /(?:अगली बार|अगले दौरे में|अगली विज़िट में)[,:]?\s*(.+)/,
  /(?:याद रखना|याद दिलाना)[,:]?\s*(.+)/,
];

const cleanup = (s: string) =>
  s
    .trim()
    .replace(/^(that|to)\s+/i, '')
    .replace(/[.।!]+$/, '')
    .trim();

export function extractReminders(note: string): string[] {
  const sentences = note
    .split(/(?<=[.!?।])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const found: string[] = [];
  for (const s of sentences) {
    for (const cue of CUES) {
      const m = s.match(cue);
      if (m?.[1]) {
        const text = cleanup(m[1]);
        if (text.split(/\s+/).length >= 2) {
          found.push(text.charAt(0).toUpperCase() + text.slice(1));
          break;
        }
      }
    }
  }
  return [...new Set(found)].slice(0, 5);
}
