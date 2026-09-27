import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');

// Load .env from the repo root if present (Node's built-in loader, no dotenv needed).
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const config = {
  port: Number(process.env.PORT ?? 8787),
  dbPath: process.env.SMARAN_DB ?? path.join(root, 'data', 'smaran.db'),
  photoDir: process.env.SMARAN_PHOTOS ?? path.join(root, 'data', 'photos'),
  maxPhotoBytes: 6 * 1024 * 1024,
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-secret-change-me',
  sessionDays: 30,
  /** Set SMARAN_AI=off to always use the on-device drafter. */
  aiEnabled: process.env.SMARAN_AI !== 'off',
  model: process.env.SMARAN_MODEL ?? 'claude-opus-5',
  // Drafting is short, routine writing that a mentor waits on in a doorway, so default to low effort.
  effort: (process.env.SMARAN_EFFORT ?? 'low') as Effort,
  clientDist: path.join(root, 'client', 'dist'),
  isProduction: process.env.NODE_ENV === 'production',
};

if (config.isProduction && config.sessionSecret === 'dev-only-secret-change-me') {
  throw new Error('Set SESSION_SECRET before running in production.');
}
