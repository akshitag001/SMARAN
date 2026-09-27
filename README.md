# Smaran (स्मरण)

A mobile-first web app that connects the people around a government school classroom in India. Cluster Resource Persons (CRPs) observe classes and give teachers specific feedback. Teachers reply with what they tried. Block coordinators see the whole block and keep things moving when people change roles. Nothing is forgotten between visits, even when a different person makes the next one.

Built for **Challenge 5, Dead_Code_Society**.

## The problem

A mentor visits about 15 government schools. The feedback given on each visit tends to be vague ("try to improve"), and none of it is tracked. By the next visit, which may be months later and may be done by a different mentor, nobody remembers what was suggested or whether the teacher acted on it. When a mentor is transferred or promoted, what they knew about their schools leaves with them.

## Who uses it

| Role | What they do in Smaran |
| --- | --- |
| **CRP** (Cluster Resource Person) | Today's route, pre-visit brief, voice observation, photos, feedback drafted by Claude and reviewed by the CRP, reminders for the next visit, and handing over their schools |
| **Teacher** | Sees every visit's feedback and replies to each suggestion with "Trying it", "Done" or "Need help", by voice or typing. Can have feedback read aloud |
| **Block Resource Coordinator** | Block overview (coverage per CRP, overdue schools, follow-through rate), assigning schools, adding people, changing roles with a handover, and patterns across the block |

Each role signs in with a mobile number and PIN, sees only its own screens, and the API enforces the same rules.

## Features

**The visit loop**
1. **Brief:** last visit's suggestions, the teacher's replies since then, open reminders from anyone, last visit's photos, and the note from whoever handed the school over.
2. **Observe:** speak the observation in English or Hindi (or type it), and take photos with captions, which can also be spoken.
3. **Draft:** Claude turns the note into specific, constructive feedback. It also pulls "next time…" and "अगली बार…" out of the note as reminders.
4. **Review:** mark last visit's suggestions and reminders as done or not, edit the draft (a tone check flags harsh or vague lines), add reminders by voice, have the feedback read aloud, or copy it for WhatsApp.
5. **Saved:** the suggestions, reminders and photos go on the school's record. The teacher gets the feedback in their inbox.

**Reminders.** A reminder belongs to the school, not to a person, so whoever visits next sees it. Reminders can come from a visit note, be added by voice or typing from a school's page, or be left by the coordinator. They move with the school when it changes hands.

**Handovers.** When a CRP is transferred, promoted or goes on leave, their schools, open reminders and pending follow-ups move to a colleague in one step, with a handover note. The coordinator can change the outgoing person's role in the same step. Every school keeps its full history, and the new CRP sees the note on every brief. A CRP with schools can't have their role changed until they've been handed over, so nothing is orphaned.

**Photos.** Taken with the phone camera during a visit. They are shrunk on the phone to about 200 KB, kept there until they upload, and served only to people in the block (and the school's own teacher).

**Inbox.** Each person is told when something affects them: new feedback (teacher), a teacher's reply (CRP), a handover or reassigned school (CRP), or a reminder left by someone else.

**Works offline.** Every screen's data is cached on the phone. Visits, photos, reminders and teacher replies saved without signal wait in an outbox and sync when signal returns. The server ignores repeats, so a retried sync never duplicates anything.

**Patterns.** Themes that recur across schools ("Answers come from the same few children: 4 of 15 schools, up from 1") for a cluster or the whole block, compared with the previous period, with wording the coordinator can edit.

## Quick start

You need Node.js 22.13 or newer (it uses the SQLite built into Node).

```bash
npm install
npm run build        # builds the app
npm start            # http://localhost:8787
```

The first start creates `data/smaran.db` with sample data: Phanda block (Bhopal), two clusters, 21 schools and a year of visits. Every sample account uses PIN **1234**, and the sign-in screen has buttons that fill them in.

| Who | Role | Mobile |
| --- | --- | --- |
| Suresh Rathore | CRP, Bhanpur cluster | 9876543210 |
| Meera Joshi | Block Resource Coordinator | 9876500022 |
| Kavita Yadav | Teacher, GPS Ratanpur | 9876500033 |
| Vikram Singh | CRP, just joined, no schools yet | 9876500055 |

The sample data tells a story. Anita Verma covered Bhanpur until 30 days ago, then moved to Barkheda and handed her schools to Suresh. Her reminders and handover note are waiting on his briefs. Kavita has replied that she needs more slates. Try handing Suresh's schools to Vikram as Meera, then sign in as Vikram.

Run `npm run seed` (with the server stopped) to reset the data. For development with hot reload, run `npm run dev` and open http://localhost:5173.

### Claude drafting

Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`. The server drafts with `claude-opus-5` at low effort (a mentor is waiting in a doorway), using structured output and server-side refusal fallbacks. Without a key, or when Claude is unavailable, Smaran drafts with its built-in rules in English or Hindi, so a mentor is never blocked.

## How it's built

```
shared/   Types, the built-in drafter, reminder extraction, tone check and themes (used by server and phone)
server/   Express 5 API, SQLite (node:sqlite), roles, photos, Claude drafting
client/   React PWA: offline cache and outbox, voice typing and read-aloud, camera
docs/     The original single-file design prototype
```

**Server** (`server/src`)
- `app.ts` has every route, each guarded by role. Request bodies are validated with zod.
- `repo.ts` is all the SQL. It covers visits, reminders, photos, teacher replies, handovers (one transaction), school assignment, the block overview, people and patterns.
- `db/connection.ts` has the schema: users with roles, schools with an assigned CRP, visits, suggestions, teacher responses, reminders, photos, handovers and notifications.
- `ai/drafter.ts` makes the Claude call.

**Client** (`client/src`)
- Routes and tabs differ per role (`App.tsx`, `components/ui.tsx`).
- `lib/outbox.ts` queues visits, photos, reminders and replies made without signal, and syncs them later.
- `components/voice.tsx` provides a voice field used for notes, reminders, captions, teacher replies and handover notes, plus read-aloud.
- `components/photos.tsx` handles camera capture, compression, thumbnails and a full-screen viewer.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API on :8787 and the app on :5173 with hot reload |
| `npm run build` | Typechecks and builds the app into `client/dist` |
| `npm start` | Serves the API and the built app on :8787 |
| `npm run seed` | Resets the database to the sample data |
| `npm test` | 32 tests for the shared logic and the API (roles, visits, reminders, photos, replies, handovers) |
| `npm run typecheck` | Typechecks all three packages |

## Deploying

```bash
docker build -t smaran .
docker run -p 8787:8787 -v smaran-data:/data \
  -e SESSION_SECRET=change-me -e ANTHROPIC_API_KEY=sk-ant-... smaran
```

`SESSION_SECRET` is required when `NODE_ENV=production`. The database and photos live in `/data`. Serve over HTTPS: phones only allow the camera, microphone and service worker on secure origins (and on localhost).

## Not done yet

- Notifications appear in the in-app inbox only. SMS or WhatsApp delivery would need a provider account.
- Voice typing uses the browser's speech service, which needs signal. Offline audio capture with later transcription is not built.
- PINs are set by the coordinator. There is no self-service PIN reset yet.
- Upgrading from the first prototype's database rebuilds it with sample data. Real deployments will need proper migrations.
