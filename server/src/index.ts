import { config } from './config';
import { openDb, isEmpty } from './db/connection';
import { DEMO_LOGIN, seedDemo } from './db/seed';
import { createApp } from './app';
import { aiStatus } from './ai/drafter';

const db = openDb(config.dbPath);
if (isEmpty(db)) {
  seedDemo(db);
  console.log(`Loaded sample data. Sign in with ${DEMO_LOGIN.phone}, PIN ${DEMO_LOGIN.pin}.`);
}

const app = createApp(db);
const server = app.listen(config.port, () => {
  const ai = aiStatus();
  console.log(`Smaran API on http://localhost:${config.port}`);
  if (!ai.enabled) console.log(`Drafting on-device only: ${ai.reason}.`);
  else if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) console.log(`Drafting with ${ai.model} (effort ${config.effort}).`);
  else console.log(`No ANTHROPIC_API_KEY set: drafting with ${ai.model} if an \`ant auth login\` profile exists, otherwise on-device.`);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
