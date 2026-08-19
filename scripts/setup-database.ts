/**
 * The one documented command for bringing a database up to date.
 *
 *   bun run db:setup
 *
 * Runs, in the only order that works:
 *
 *   1. `drizzle-kit migrate`             — schema
 *   2. `db:seed:catalog --apply`         — the canonical food catalog and its portions
 *   3. `db:seed:dishes`                  — the dish catalog, which joins to it
 *   4. `db:backfill:plan-snapshots --apply` — freezes any published plan that predates Phase 0
 *   5. `db:check`                        — refuses to report success unless the result is servable
 *
 * The order is the whole point. Recipes resolve to `catalog_foods`, so seeding
 * dishes before the catalog fails loudly; and a database that is migrated but not
 * seeded fails *silently*, with an empty ingredient search and no error anywhere.
 * Having one command means nobody has to remember either fact.
 *
 * Safe to re-run: every step is idempotent, and step 5 fails the whole thing rather
 * than leaving a half-set-up database looking finished.
 *
 * This does **not** seed demo data — no clinic, no clients, no appointments. That
 * is `bun run db:seed`, which is a separate decision from "make this database
 * work".
 */
import { spawnSync } from 'node:child_process';

type Step = { label: string; command: string; args: string[] };

const STEPS: Step[] = [
  { label: 'migrate', command: 'bunx', args: ['drizzle-kit', 'migrate'] },
  { label: 'seed catalog', command: 'bun', args: ['run', 'scripts/seed-catalog-foods.ts', '--apply'] },
  { label: 'seed dishes', command: 'bun', args: ['run', 'scripts/seed-dishes.ts'] },
  {
    label: 'freeze published plans',
    command: 'bun',
    args: ['run', 'scripts/backfill-plan-nutrition-snapshots.ts', '--apply'],
  },
  { label: 'check readiness', command: 'bun', args: ['run', 'scripts/check-catalog-readiness.ts'] },
];

for (const [index, step] of STEPS.entries()) {
  console.info(`\n── ${index + 1}/${STEPS.length}  ${step.label} ──`);

  const result = spawnSync(step.command, step.args, { stdio: 'inherit', shell: true });

  if (result.status !== 0) {
    // Stop at the first failure rather than pressing on: every later step depends
    // on the one before it, and a cascade of errors buries the one that matters.
    console.error(`\n"${step.label}" failed (exit ${result.status}). Nothing after it was run.`);
    process.exit(result.status ?? 1);
  }
}

console.info('\ndatabase is ready.');
process.exit(0);
