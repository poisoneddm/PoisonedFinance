import 'dotenv/config';
import { createApp } from '@/app';
import { runMigrations } from '@/db/migrate';

const PORT = process.env.PORT ?? '3000';

async function main() {
  await runMigrations();
  const app = createApp();
  app.listen(Number(PORT), () => {
    console.log(`[api] listening on :${PORT}`);
  });
}

main().catch(err => {
  console.error('[api] fatal:', err);
  process.exit(1);
});
