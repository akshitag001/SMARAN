import { describe, expect, it } from 'vitest';
import { classifySuggestion, extractReminders, localDraft, strengthThemes, toneCheck, addDays, daysBetween } from './index';

describe('localDraft', () => {
  it('picks themes in the order the mentor mentioned them', () => {
    const d = localDraft('Examples on the board were rushed. Only 2 strong kids in front answered.', 'en');
    expect(d.actions.map((a) => a.do)).toEqual([
      'After each board example, let children try a similar one on slates.',
      'Call on children by name from every row, not only volunteers.',
    ]);
  });

  it('lifts positive sentences into what worked, and skips mixed ones', () => {
    const d = localDraft('Stick bundles were used well at the start. Good energy but not enough practice.', 'en');
    expect(d.strength).toBe('I noticed: Stick bundles were used well at the start.');
  });

  it('leaves what worked empty rather than inventing it', () => {
    expect(localDraft('Only the front row answered.', 'en').strength).toBe('');
  });

  it('writes Hindi when the mentor spoke Hindi', () => {
    const d = localDraft('सिर्फ़ लड़के जवाब दे रहे थे, लड़कियाँ बिल्कुल नहीं बोलीं।', 'hi');
    expect(d.actions[0].do).toContain('लड़की');
  });

  it('always offers at least one suggestion', () => {
    expect(localDraft('Class was on track.', 'en').actions).toHaveLength(1);
  });
});

describe('toneCheck', () => {
  it('flags harsh wording', () => {
    expect(toneCheck('The teacher was careless today')?.kind).toBe('harsh');
  });
  it('flags vague wording without a concrete action', () => {
    expect(toneCheck('Needs to improve teaching')?.kind).toBe('vague');
  });
  it('accepts concrete suggestions that use soft words', () => {
    expect(toneCheck('Better to ask two children from the back row after each example')).toBeNull();
  });
});

describe('themes', () => {
  it('classifies written suggestions', () => {
    expect(classifySuggestion('Call on children by name from every row')).toBe('names');
    expect(classifySuggestion('Put up a print-rich wall at children’s eye level')).toBe('materials');
    expect(classifySuggestion('Take answers from a girl and a boy in turn')).toBe('girls');
    expect(classifySuggestion('Keep the village map on the wall')).toBeNull();
  });
  it('spots kit use in what worked', () => {
    expect(strengthThemes('Stick bundles made tens and ones clear')).toEqual(['tlm']);
  });
});

describe('dates', () => {
  it('adds days across months', () => {
    expect(addDays('2026-09-27', -75)).toBe('2026-07-14');
    expect(daysBetween('2026-07-14', '2026-09-27')).toBe(75);
  });
});

describe('extractReminders', () => {
  it('pulls next-time reminders out of a note', () => {
    expect(
      extractReminders('Good lesson on fractions. Next time check if the library register is being filled. Remind me to ask about the hand pump.'),
    ).toEqual(['Check if the library register is being filled', 'Ask about the hand pump']);
  });
  it('understands Hindi', () => {
    expect(extractReminders('बच्चे ध्यान से सुन रहे थे। अगली बार पुस्तकालय रजिस्टर देखना है।')).toEqual(['पुस्तकालय रजिस्टर देखना है']);
  });
  it('ignores notes without reminders', () => {
    expect(extractReminders('Only the front row answered.')).toEqual([]);
  });
  it('is part of the on-device draft', () => {
    expect(localDraft('Examples were rushed. Next time I should see the slates.', 'en').reminders).toEqual(['See the slates']);
  });
});
