export interface ToneCue {
  kind: 'harsh' | 'vague';
  message: string;
}

const VAGUE = /\b(improve|improvement|better|try harder|work (on|harder)|be careful|more effort|pay attention|focus more|good job|keep it up|overall|properly|as needed|needs work)\b|सुधार करें|ध्यान दें|बेहतर/i;
const CONCRETE = /\b(\d+|minutes?|rows?|slates?|board|groups?|pairs?|names?|ask|write|show|read|cards?|bundles?|chart|each|every|daily|before|after|start|end|turn)\b|मिनट|स्लेट|बोर्ड|समूह|नाम|हर|रोज़/i;
const HARSH = /\b(poor|bad|careless|lazy|useless|failed|failure|pathetic|waste|disappointing|not serious|incompetent|terrible|never|should know|shameful|hopeless)\b|खराब|लापरवाह|बेकार|नाकाम/i;

/**
 * A calm nudge when a line of feedback reads as harsh or vague.
 * It never blocks saving; the mentor decides.
 */
export function toneCheck(text: string): ToneCue | null {
  if (!text.trim()) return null;
  if (HARSH.test(text)) {
    return { kind: 'harsh', message: 'This may land as harsh. Try describing what happened in class rather than the teacher.' };
  }
  if (VAGUE.test(text) && !CONCRETE.test(text)) {
    return { kind: 'vague', message: 'This reads a little vague. What exactly should happen in class?' };
  }
  return null;
}
