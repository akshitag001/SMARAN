import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { STATE_LABEL, type CheckedState, type Draft, type Lang, type School, type Visit } from '@smaran/shared';
import { config } from '../config';

const DraftSchema = z.object({
  strength: z.string().describe('What worked in the lesson, from the observation only. Empty string if nothing positive was noted.'),
  actions: z
    .array(
      z.object({
        do: z.string().describe('One concrete classroom action, under 15 words.'),
        how: z.string().describe('One or two sentences on exactly how to do it.'),
      }),
    )
    .describe('One or two suggestions, most important first.'),
  summary: z.string().describe('One line for the school record, third person, under 22 words.'),
  reminders: z
    .array(z.string())
    .describe('Things the mentor said to check or do at the next visit, each as a short instruction. Empty if none.'),
});

// Stable instructions; the per-visit context goes in the user turn.
const SYSTEM = `You help government school mentors in India (Cluster Resource Persons) turn a rough, spoken classroom observation into feedback they will give the teacher face to face after the lesson.

Write the way an experienced, respected colleague talks: warm, plain and specific. No jargon, no corporate or clinical words, no inflated praise and nothing harsh. Speak to the teacher as "you".

- strength: one or two sentences on something specific that worked, taken only from the observation. If the observation shows progress on an earlier suggestion, say so here. If nothing positive was noted, return an empty string. Never invent what the mentor did not see.
- actions: one or two suggestions, the most important first. "do" is a single classroom action the teacher could try tomorrow. "how" explains exactly how, for a government school classroom: large classes, slates, a blackboard, the FLN kit.
- summary: one line for the school's visit record, in third person, without pronouns.
- reminders: anything the mentor said to check or do at the next visit ("next time…", "remind me to…", "अगली बार…"), each rewritten as a short instruction for whoever visits next, in the same language. These are notes for the mentor, not feedback for the teacher. Return an empty list if there are none.

The observation may mix Hindi and English and may contain speech-to-text errors; read it for meaning.`;

export interface DraftContext {
  school: School;
  lastVisit: Visit | null;
  checks: Record<string, CheckedState>;
  note: string;
  lang: Lang;
}

function userPrompt({ school, lastVisit, checks, note, lang }: DraftContext): string {
  const earlier = lastVisit?.items.length
    ? lastVisit.items
        .map((i) => {
          const today = checks[i.id] ? STATE_LABEL[checks[i.id]] : i.state === 'pending' ? 'not checked today' : STATE_LABEL[i.state];
          return `- ${i.text} (${today})`;
        })
        .join('\n')
    : 'None. This is the first visit on record.';
  return `Teacher: ${school.teacher}, ${school.classLabel}, ${school.subject}, ${school.name}

Suggestions from the last visit, and what the mentor saw today:
${earlier}

Mentor's observation:
<observation>
${note}
</observation>

Write the feedback in ${lang === 'hi' ? 'simple, everyday Hindi in Devanagari script' : 'plain Indian English'}.`;
}

let client: Anthropic | null = null;
let disabledReason: string | null = config.aiEnabled ? null : 'SMARAN_AI=off';

export function aiStatus(): { enabled: boolean; reason: string | null; model: string } {
  return { enabled: disabledReason === null, reason: disabledReason, model: config.model };
}

/**
 * Drafts feedback with Claude. Returns null when Claude is unavailable or declines,
 * so the caller can fall back to the on-device drafter.
 */
export async function draftWithClaude(ctx: DraftContext, signal?: AbortSignal): Promise<Draft | null> {
  if (disabledReason) return null;
  // Credentials come from ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN or an `ant auth login` profile.
  client ??= new Anthropic({ maxRetries: 1, timeout: 60_000 });

  try {
    const response = await client.beta.messages.parse(
      {
        model: config.model,
        max_tokens: 8000,
        // On a policy decline, let the API re-run the request on its recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        output_config: { effort: config.effort, format: betaZodOutputFormat(DraftSchema) },
        messages: [{ role: 'user', content: userPrompt(ctx) }],
      },
      { signal },
    );

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') return null;
    const out = response.parsed_output;
    if (!out) return null;

    const actions = out.actions
      .map((a) => ({ do: a.do.trim(), how: a.how.trim() }))
      .filter((a) => a.do)
      .slice(0, 3);
    if (!actions.length) return null;
    const reminders = out.reminders.map((r) => r.trim()).filter(Boolean).slice(0, 5);
    return { strength: out.strength.trim(), actions, summary: out.summary.trim(), reminders };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      disabledReason = 'Claude credentials were rejected';
      console.warn(`[drafter] ${disabledReason}; using the on-device drafter from now on.`);
      return null;
    }
    if (err instanceof Anthropic.APIUserAbortError) throw err;
    if (err instanceof Anthropic.RateLimitError) {
      console.warn('[drafter] Rate limited by the Claude API; falling back for this draft.');
      return null;
    }
    if (err instanceof Anthropic.APIError) {
      console.warn(`[drafter] Claude API error ${err.status ?? ''}: ${err.message}`);
      return null;
    }
    // Anything else is a client-side problem, most often no credentials configured at all.
    // Drafting must never fail a mentor, so switch to the on-device drafter.
    disabledReason = `Claude is not configured (${err instanceof Error ? err.message.split('.')[0] : 'unknown error'})`;
    console.warn(`[drafter] ${disabledReason}; using the on-device drafter.`);
    return null;
  }
}
