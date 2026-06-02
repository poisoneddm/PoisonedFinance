/**
 * migrate-cli.ts
 *
 * Fly.io release_command entrypoint (fly.toml [deploy]).
 * Runs pending SQL migrations then exits.
 *
 * Exit 0 → migrations succeeded; Fly.io proceeds with the deploy.
 * Exit 1 → migration failed; Fly.io aborts the deploy and keeps the
 *           previous release live (contracts §11).
 *
 * Built by `npm run build` → dist/db/migrate-cli.js
 */

import { runMigrations } from './migrate';

runMigrations()
  .then(() => {
    console.log('[migrate-cli] migrations complete');
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error('[migrate-cli] migration failed:', err);
    process.exit(1);
  });
