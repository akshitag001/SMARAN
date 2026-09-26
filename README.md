# Smaran (स्मरण)

A mobile-first web app for school mentors in India (CRPs, BRCs and ABRCs). They use it to observe classes, give teachers specific feedback, and have that feedback remembered at the next visit, even when a different mentor comes.

Prototype for **Challenge 5, Dead_Code_Society**.

## The problem

A mentor visits about 15 government schools. The feedback given on each visit tends to be vague ("try to improve"), and none of it is tracked. By the next visit, which may be months later and may be done by a different mentor, nobody remembers what was suggested or whether the teacher acted on it. So the mentoring starts over every time.

## The loop

1. **Pre-visit brief:** what was suggested last time, and whether it was done
2. **Voice observation:** a raw spoken note, with no forms
3. **Feedback drafted:** the note is turned into specific, constructive feedback
4. **Mentor reviews:** the mentor edits and approves it; nothing is shared without this step
5. **Saved to the school:** the feedback is filed against that school and teacher
6. **Resurfaced next visit:** "Last time X was suggested. Was it done?"

## Screens

| Screen | What it does |
| --- | --- |
| Today | The day's route with visit order, last visit dates and "items to check". When the route is done it shows an end-of-day summary |
| Pre-visit brief | School, teacher, UDISE code, the last visit (flags a rotated mentor) and last suggestions with their state |
| Observe | Large record button with a live waveform, English or Hindi, and a typing fallback for noisy rooms |
| Drafting | A short pause while the draft is written. The mentor can skip it and write the feedback themselves |
| Review | Checks last visit's suggestions (Done, Partly, Not yet). Shows the draft on an editable ruled page, a tone check for harsh or vague lines, and copy for WhatsApp |
| Saved | A stamp confirms the save (the app's one piece of motion) and shows sync status |
| School history | Timeline of visits and a follow-through tally of every suggestion |
| Patterns (roadmap) | A cluster-wide view for the Block Resource Coordinator, in plain language with editable wording |

## Running it

It is one file with no build step. Open `index.html` in Chrome.

- **Voice:** in Chrome, the browser's speech recognition is used (`en-IN` or `hi-IN`). Where the microphone isn't available, a sample observation is filled in instead, and the screen says so.
- **Drafting:** when the app runs as a Claude artifact, Claude drafts the feedback through the artifact `sample` capability. Anywhere else, or with no signal, a rule-based drafter on the phone writes the draft in English or Hindi.
- **Offline:** notes are kept on the phone and counted as waiting to sync. Use *Demo controls → Simulate no signal* to try this.
- **Data:** all schools, teachers and visit records are sample data, stored in the browser's `localStorage`. *Reset demo data* restores them.

## Design notes

- **Palette:** cool register-paper white, royal-blue fountain-pen ink ("Quink") for actions, and marigold used only for "look for this" and the margin line of the register. Dark mode is a blackboard green, not black.
- **Type:** Mukta (Latin and Devanagari) for the interface. Tiro Devanagari Hindi, a serif, is used only for school and teacher names, like a handwritten register.
- **States are shown by shape as well as colour:** filled check for done, half-filled for partly, hollow ring for not yet, dashed ring for still to check.
- **Numbering only where order is real:** the route order and the four visit steps.
- **The mentor stays the author:** AI text is always shown as the mentor's own editable draft, never as a locked result.
