/**
 * Answers one question: is this database in a state the application can serve?
 *
 *   bun run db:check
 *
 * Exits 0 when every check passes, 1 with a named list when any fails.
 *
 * ## Why this exists
 *
 * Every food query in the product reads `catalog_foods`. A database that has been
 * migrated but not seeded therefore looks completely healthy — the tables are
 * there, the app boots, nothing throws — and then the ingredient picker returns
 * nothing for every search and the dish catalog is empty, with no error anywhere
 * saying why. That failure is silent, and it is the exact shape of failure this
 * feature exists to prevent, so it gets a check rather than a comment.
 *
 * The rest are the invariants the schema cannot express on its own: a recipe
 * pointing at a portion of a different food, a clinic-scoped portion reachable
 * from another clinic, and a published plan whose nutrition is not really frozen.
 * Each one is silent in the same way — nothing errors, the numbers are simply
 * wrong.
 *
 * ## Counts come from the committed datasets, never from this file
 *
 * "Is the catalog seeded" used to mean "are there more than zero shared foods",
 * which a database holding **one** food passes. A half-finished seed, an
 * interrupted run, a dataset that grew since the last deploy — all of them left a
 * catalog that was wrong and a check that said ready. So the expected numbers are
 * read out of `data/catalog-foods.json` and `data/dishes.json` at run time: they
 * cannot drift from what a correct seed would produce, and adding a food to the
 * dataset updates this check by doing nothing at all.
 */
import { sql } from 'drizzle-orm';

import { db } from '@/db';
import { normalizeArabic } from '@/features/weekly-plans/arabic-normalize';
import { readMealSnapshot } from '@/features/weekly-plans/nutrition-snapshot';

import { catalogChecksum } from './build-catalog-dataset';
import { readCatalogDataset } from './seed-catalog-foods';
import { readDishDataset } from './seed-dishes';

type Check = {
  name: string;
  /** What is wrong, or null when this check passes. */
  problem: string | null;
  /** What to run to fix it. */
  fix?: string;
};

async function count(query: ReturnType<typeof sql>): Promise<number> {
  const [row] = await db.execute<{ n: number }>(query);
  return Number(row?.n ?? 0);
}

/** What a correctly seeded database holds, derived from the files in the repository. */
export type CatalogExpectation = {
  checksum: string;
  foods: number;
  aliases: number;
  portions: number;
  dishes: number;
  dishIngredients: number;
  /** Lines a dietitian adjusts by hand. Zero of these means the −/+ never appears. */
  primaryIngredients: number;
  /** Lines counted in a household unit rather than weighed. */
  unitIngredients: number;
};

/**
 * Reads both committed datasets and totals what they describe.
 *
 * `readCatalogDataset` is the same call the seed makes, so it throws here for the
 * same reasons it would there — a checksum that no longer matches the curated
 * rows, a missing nutrient key, a portion with two defaults. A dataset this
 * process cannot trust is a failure of the *release*, not of the database, and it
 * is worth learning before a deploy rather than during one.
 */
/**
 * How many alias rows one food actually becomes.
 *
 * Not `aliasesAr.length + aliasesEn.length`: `ارز` and `أرز` normalize to the same
 * string, the unique index is on the normalized form, and the seed drops the
 * second on purpose. Counting the raw list would make a correctly seeded database
 * look one row short — a check that fails when nothing is wrong is worse than no
 * check, so this counts what the seed can actually write.
 */
function storableAliases(food: { aliasesAr: string[]; aliasesEn: string[] }): number {
  const normalized = new Set(
    [...food.aliasesAr, ...food.aliasesEn].map(normalizeArabic).filter(Boolean),
  );
  return normalized.size;
}

export function readExpectation(): CatalogExpectation {
  const foods = readCatalogDataset();
  const dishes = readDishDataset();

  return {
    checksum: catalogChecksum(foods),
    foods: foods.length,
    aliases: foods.reduce((total, food) => total + storableAliases(food), 0),
    portions: foods.reduce((total, food) => total + food.portions.length, 0),
    dishes: dishes.length,
    dishIngredients: dishes.reduce((total, dish) => total + dish.ingredients.length, 0),
    primaryIngredients: dishes.reduce(
      (total, dish) => total + dish.ingredients.filter((line) => line.primary).length,
      0,
    ),
    unitIngredients: dishes.reduce(
      (total, dish) => total + dish.ingredients.filter((line) => line.unit).length,
      0,
    ),
  };
}

export async function checkCatalogReadiness(): Promise<Check[]> {
  const checks: Check[] = [];

  // 0. The committed dataset is internally consistent. Everything below compares
  //    the database against it, so a dataset that cannot be trusted makes every
  //    later count meaningless rather than merely unchecked.
  let expected: CatalogExpectation;
  try {
    expected = readExpectation();
  } catch (error) {
    return [
      {
        name: 'committed catalog dataset is valid',
        problem: error instanceof Error ? error.message : String(error),
        fix: 'bun run db:build-catalog',
      },
    ];
  }

  checks.push({
    name: `committed catalog dataset is valid (checksum ${expected.checksum})`,
    problem: null,
  });

  // 1. The shared catalog is seeded **completely**, not merely non-empty.
  const foods = await count(sql`select count(*)::int as n from catalog_foods where clinic_id is null`);
  checks.push({
    name: `shared catalog holds all ${expected.foods} foods`,
    problem:
      foods === expected.foods
        ? null
        : foods === 0
          ? 'catalog_foods holds no shared foods — every ingredient search returns nothing'
          : `catalog_foods holds ${foods} shared food(s); the committed dataset describes ${expected.foods}`,
    fix: 'bun run db:seed:catalog --apply',
  });

  // 2. Synonyms and household measures come with them. A catalog seeded without
  //    its aliases still searches — badly, and only by canonical name — and one
  //    seeded without its portions silently becomes grams-only.
  const aliases = await count(sql`
    select count(*)::int as n
    from catalog_food_aliases a
    join catalog_foods f on f.id = a.food_id
    where f.clinic_id is null
  `);
  checks.push({
    name: `shared foods carry their ${expected.aliases} aliases`,
    problem:
      aliases === expected.aliases
        ? null
        : `catalog_food_aliases holds ${aliases} row(s) for shared foods; the dataset describes ${expected.aliases}`,
    fix: 'bun run db:seed:catalog --apply',
  });

  const portions = await count(sql`
    select count(*)::int as n
    from catalog_food_portions p
    join catalog_foods f on f.id = p.food_id
    where f.clinic_id is null
  `);
  checks.push({
    name: `shared foods carry their ${expected.portions} portions`,
    problem:
      portions === expected.portions
        ? null
        : `catalog_food_portions holds ${portions} row(s) for shared foods; the dataset describes ${expected.portions}`,
    fix: 'bun run db:seed:catalog --apply',
  });

  // 3. The shipped dish catalog is complete too. A clinic's own dishes are not
  //    counted here — they are not shipped and their number is nobody's invariant.
  const dishes = await count(
    sql`select count(*)::int as n from dishes where clinic_id is null and is_active = true`,
  );
  checks.push({
    name: `shipped dish catalog holds all ${expected.dishes} dishes`,
    problem:
      dishes === expected.dishes
        ? null
        : `dishes holds ${dishes} active shared dish(es); data/dishes.json describes ${expected.dishes}`,
    fix: 'bun run db:seed:dishes',
  });

  const shippedIngredients = await count(sql`
    select count(*)::int as n
    from dish_ingredients di
    join dishes d on d.id = di.dish_id
    where d.clinic_id is null and d.is_active = true
  `);
  checks.push({
    name: `shipped dishes carry all ${expected.dishIngredients} ingredients`,
    problem:
      shippedIngredients === expected.dishIngredients
        ? null
        : `shipped dishes hold ${shippedIngredients} ingredient row(s); data/dishes.json describes ${expected.dishIngredients}`,
    fix: 'bun run db:seed:dishes',
  });

  // 4. Every recipe line resolves to a food. `catalog_food_id` is NOT NULL since
  //    Phase 2, so this can only fail on a database migrated but not re-seeded.
  const unmapped = await count(sql`
    select count(*)::int as n
    from dish_ingredients di
    left join catalog_foods f on f.id = di.catalog_food_id
    where f.id is null
  `);
  checks.push({
    name: 'every dish ingredient resolves to a catalog food',
    problem: unmapped > 0 ? `${unmapped} dish ingredient(s) reference a food that does not exist` : null,
    fix: 'bun run db:seed:catalog --apply && bun run db:seed:dishes',
  });

  // 5. And to a food it is allowed to reach. A shared dish must never depend on a
  //    clinic-private food: it is visible to every clinic, and its ingredient
  //    would not be.
  const inaccessible = await count(sql`
    select count(*)::int as n
    from dish_ingredients di
    join dishes d on d.id = di.dish_id
    join catalog_foods f on f.id = di.catalog_food_id
    where f.is_active = false
       or (f.clinic_id is not null and d.clinic_id is null)
  `);
  checks.push({
    name: 'every dish ingredient resolves to an accessible food',
    problem:
      inaccessible > 0
        ? `${inaccessible} dish ingredient(s) reference a retired food, or a shared dish depends on a clinic-private one`
        : null,
  });

  // 6. A saved portion must belong to the food on its own line. Nothing in the
  //    schema can say this — both columns are valid foreign keys individually —
  //    and getting it wrong means measuring one food with another food's cup.
  const crossedPortions = await count(sql`
    select count(*)::int as n
    from dish_ingredients di
    join catalog_food_portions p on p.id = di.portion_id
    where p.food_id <> di.catalog_food_id
  `);
  checks.push({
    name: 'every saved portion belongs to its own ingredient food',
    problem:
      crossedPortions > 0
        ? `${crossedPortions} dish ingredient(s) reference a portion belonging to a different food`
        : null,
  });

  // 7. Clinic ownership is consistent. A portion inherits its scope from its food,
  //    so a recipe in clinic A must never reach a portion or food owned by clinic B.
  const crossedClinics = await count(sql`
    select count(*)::int as n
    from dish_ingredients di
    join dishes d on d.id = di.dish_id
    join catalog_foods f on f.id = di.catalog_food_id
    where f.clinic_id is not null
      and (d.clinic_id is null or d.clinic_id <> f.clinic_id)
  `);
  checks.push({
    name: 'no dish uses a food from another clinic',
    problem:
      crossedClinics > 0
        ? `${crossedClinics} dish ingredient(s) use a clinic-owned food from a different clinic (or a shared dish uses a private food)`
        : null,
  });

  // 8. The marking survived the seed. A dish loses its controls silently: the board
  //    still renders, the amounts are still right, and the −/+ is simply not there
  //    — which looks like a missing feature rather than a missing column.
  //
  //    Scoped to the shipped dishes, like check 3 above: the number on the right of
  //    this comparison describes `data/dishes.json` and nothing else, so the number
  //    on the left has to be counted over the same rows. Unscoped it agrees today
  //    only because `createClinicDish` never writes `is_primary` — it would start
  //    failing the day a dietitian can mark a line of her own, for a reason that has
  //    nothing to do with whether the seed ran.
  const primary = await count(sql`
    select count(*)::int as n
    from dish_ingredients di
    join dishes d on d.id = di.dish_id
    where di.is_primary and d.clinic_id is null and d.is_active = true
  `);
  checks.push({
    name: `dish ingredients carry all ${expected.primaryIngredients} adjustable lines`,
    problem:
      primary === expected.primaryIngredients
        ? null
        : `${primary} of ${expected.primaryIngredients} adjustable ingredients are marked`,
    fix: 'bun run db:seed:dishes',
  });

  // 9. And so did the units. A line that lost its portion falls back to grams,
  //    which is safe and readable but steps in tens instead of by the loaf.
  //    Scoped the same way, and here it was not hypothetical: a clinic dish saved
  //    with a household unit does write `portion_id`, so an unscoped count read a
  //    dietitian's own recipe as catalog corruption and failed a deploy over it.
  const withUnit = await count(sql`
    select count(*)::int as n
    from dish_ingredients di
    join dishes d on d.id = di.dish_id
    where di.portion_id is not null and d.clinic_id is null and d.is_active = true
  `);
  checks.push({
    name: `dish ingredients keep all ${expected.unitIngredients} household units`,
    problem:
      withUnit === expected.unitIngredients
        ? null
        : `${withUnit} of ${expected.unitIngredients} ingredients kept the unit they were authored in`,
    fix: 'bun run db:seed:dishes',
  });

  // 10. A hand-set meal amount states a portion and a count together or neither.
  //     Half of the pair is a line the reader cannot state in any unit.
  const halfPairs = await count(sql`
    select count(*)::int as n
    from weekly_plan_meal_ingredients
    where (portion_id is null) <> (portion_quantity is null)
  `);
  checks.push({
    name: 'hand-set meal amounts state a unit and a count together',
    problem:
      halfPairs > 0
        ? `${halfPairs} meal ingredient(s) carry a unit without a count, or the reverse`
        : null,
  });

  // 11. And it belongs to the food it is on, the same rule dish recipes obey.
  const crossedMealPortions = await count(sql`
    select count(*)::int as n
    from weekly_plan_meal_ingredients mi
    join catalog_food_portions p on p.id = mi.portion_id
    where p.food_id <> mi.catalog_food_id
  `);
  checks.push({
    name: 'every hand-set amount uses a portion of its own food',
    problem:
      crossedMealPortions > 0
        ? `${crossedMealPortions} meal ingredient(s) reference a portion belonging to a different food`
        : null,
  });

  checks.push(await checkFrozenPlans());

  return checks;
}

/**
 * Phase 0's invariant, checked properly: a published or archived plan's nutrition
 * is frozen **and readable**.
 *
 * This used to be `nutrition_snapshot is null`, which SQL can answer on its own.
 * That is the wrong question. A row holding `{}`, or `{"version": 2, …}` written
 * by a future build, is not null and is not a snapshot either — and the reader
 * treated an unusable blob exactly as it treated a draft, so the plan quietly went
 * back to calculating live under a column that said it did not. So every blob is
 * read through the same validator the application reads it with, which is the only
 * way the two can agree about what "frozen" means.
 */
async function checkFrozenPlans(): Promise<Check> {
  const rows = await db.execute<{ id: string; plan_id: string; nutrition_snapshot: unknown }>(sql`
    select m.id, m.plan_id, m.nutrition_snapshot
    from weekly_plan_meals m
    join weekly_plans p on p.id = m.plan_id
    where p.status in ('published', 'archived')
      and m.dish_id is not null
  `);

  let missing = 0;
  let damaged = 0;
  let unsupported = 0;

  for (const row of rows) {
    const read = readMealSnapshot(row.nutrition_snapshot);
    if (read.status === 'valid') continue;
    if (read.status === 'absent') missing += 1;
    else if (read.status === 'unsupported') unsupported += 1;
    else damaged += 1;
  }

  const broken = missing + damaged + unsupported;

  return {
    name: `published plans carry valid frozen nutrition (${rows.length} meal(s))`,
    problem:
      broken === 0
        ? null
        : `${broken} published/archived meal(s) have no usable nutrition snapshot — ${missing} missing, ${damaged} malformed, ${unsupported} of an unsupported version`,
    fix: 'bun run db:backfill:plan-snapshots --apply',
  };
}

if (import.meta.main) {
  const [database] = await db.execute<{ name: string }>(sql`select current_database() as name`);
  console.info(`database: ${database?.name ?? 'unknown'}\n`);

  const checks = await checkCatalogReadiness();
  const failed = checks.filter((check) => check.problem !== null);

  for (const check of checks) {
    console.info(`${check.problem === null ? 'ok  ' : 'FAIL'}  ${check.name}`);
  }

  if (failed.length) {
    console.error('\nNot ready:');
    for (const check of failed) {
      console.error(`  ${check.problem}`);
      if (check.fix) console.error(`    fix: ${check.fix}`);
    }
    process.exit(1);
  }

  console.info('\nready.');
  process.exit(0);
}
