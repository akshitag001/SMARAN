# Smaran (स्मरण)

A mobile-first web app for school mentors in India (CRPs, BRCs and ABRCs). They use it to observe classes, give teachers specific feedback, and have that feedback remembered at the next visit, even when a different mentor comes.

Built for **Challenge 5, Dead_Code_Society**.

## The problem

A mentor visits about 15 government schools. The feedback given on each visit tends to be vague ("try to improve"), and none of it is tracked. By the next visit, which may be months later and may be done by a different mentor, nobody remembers what was suggested or whether the teacher acted on it. So the mentoring starts over every time.

## The loop

1. **Pre-visit brief:** what was suggested last time, and whether it was done
2. **Voice observation:** a raw spoken note in English or Hindi, with no forms
3. **Feedback drafted:** Claude turns the note into specific, constructive feedback
4. **Mentor reviews:** the mentor edits and approves it; nothing is shared without this step
5. **Saved to the school:** the feedback is filed against that school and teacher
6. **Resurfaced next visit:** each suggestion comes back as "Was it done?" and is marked Done, Partly or Not yet

A **Patterns** view rolls this up across the cluster for the Block Resource Coordinator ("Answers come from the same few children: 4 of 15 schools, up from 1").

## Quick start

You need Node.js 22.13 or newer (it uses the SQLite built into Node).

```bash
npm install
npm run build        # builds the app
npm start            # http://localhost:8787
```

Sign in with the sample mentor: mobile **9876543210**, PIN **1234**.

The first start creates `data/smaran.db` and loads sample data: one cluster (Jan Shiksha Kendra Bhanpur) with 15 schools, two CRPs and a year of visits. Run `npm run seed` to reset it.

For development with hot reload, run `npm run dev` and open http://localhost:5173.

### Claude drafting

Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`. The server drafts with `claude-opus-5` at low effort (a mentor is waiting in a doorway), using structured output and server-side refusal fallbacks. Without a key, or when Claude is unavailable, the server drafts with Smaran's built-in rules, so a mentor is never blocked.

## How it's built

```
shared/   Types, the on-device drafter, the tone check and themes, shared by server and phone
server/   Express 5 API, SQLite (node:sqlite), Claude drafting, session auth
client/   React PWA: offline cache, outbox, voice typing
docs/     The original single-file design prototype
```

**Server** (`server/src`)
- `app.ts` has the routes: `/auth/login`, `/today`, `/schools`, `/schools/:id`, `/schools/:id/brief`, `/drafts`, `/visits`, `/patterns`. Request bodies are validated with zod.
- `repo.ts` is all the SQL. It plans a day's route (schools waiting longest come first), saves a visit and closes last visit's suggestions in one transaction, and computes patterns by comparing the last 60 days with the 60 before.
- `ai/drafter.ts` makes the Claude call. The prompt asks for plain, warm, specific feedback, taken only from what the mentor saw.
- `auth.ts` handles login by phone number and PIN (hashed with scrypt), with HMAC-signed session tokens.

**Client** (`client/src`)
- **Offline first.** Every screen's data is cached in IndexedDB. A visit saved with no signal goes to an outbox and syncs when the phone reconnects. The server ignores repeats by `clientId`, so a retried sync never duplicates a visit. A service worker keeps the app itself available offline.
- **The visit in progress** (note, draft, checks) is kept on the phone, so a reload or a dead battery mid-visit doesn't lose the note.
- **Voice typing** uses the browser's speech recognition (`en-IN` or `hi-IN`). Where it isn't available, the app says so and switches to typing.
- **Tone check.** Harsh or vague lines get a calm cue. It never blocks saving.

**Design.** The palette is cool register-paper white, royal-blue fountain-pen ink for actions, and marigold only for "look for this" and the register's margin line. Dark mode is blackboard green. Mukta (Latin and Devanagari) is used for the interface; Tiro Devanagari Hindi, a serif, is used only for school and teacher names. Suggestion states are shown by shape as well as colour. Numbering appears only where order is real: the day's route and the four visit steps.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API on :8787 and the app on :5173 with hot reload |
| `npm run build` | Typechecks and builds the app into `client/dist` |
| `npm start` | Serves the API and the built app on :8787 |
| `npm run seed` | Resets the database to the sample data |
| `npm test` | Tests for the shared logic and the API |
| `npm run typecheck` | Typechecks all three packages |

## Deploying

```bash
docker build -t smaran .
docker run -p 8787:8787 -v smaran-data:/data \
  -e SESSION_SECRET=change-me -e ANTHROPIC_API_KEY=sk-ant-... smaran
```

`SESSION_SECRET` is required when `NODE_ENV=production`. Serve over HTTPS: browsers only allow the microphone and service worker on secure origins (and on localhost).

## Not done yet

- Mentor accounts are created by the seed script. There is no admin screen for adding schools or mentors.
- Patterns are computed per cluster. A block-wide view across clusters is the next step.
- Voice typing depends on the browser's speech service, which needs signal. Offline audio capture with later transcription is not built.
