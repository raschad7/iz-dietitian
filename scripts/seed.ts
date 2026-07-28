/**
 * Seed script — run with `bun run db:seed`.
 *
 * Executed directly by Bun; there is no tsx/ts-node in this project.
 *
 * There are no domain tables yet, so there is nothing to seed. When features
 * land, import their schema from `@/db/schema` and insert here.
 */

export {};

async function seed(): Promise<void> {
  console.info('nothing to seed yet');
}

await seed();
