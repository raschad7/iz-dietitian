/**
 * Writes the shared food catalog back out to `data/catalog-foods.json` —
 *
 *   bun run db:export:catalog           # report only, writes nothing
 *   bun run db:export:catalog --apply   # write the file
 *
 * ## Why this exists
 *
 * The shared catalog is committed data. `db:seed:catalog --apply` upserts every
 * row in the file on `slug`, so anything edited in the platform panel is
 * overwritten the next time somebody seeds — silently, and with no sign that a
 * correction was lost. That is the whole conflict, and this script is the answer
 * to it: the panel edits the database, this makes the database what the file
 * says, and the seed then re-applies exactly what is already there.
 *
 * Run it after editing the shared catalog, and commit the diff. It is the same
 * discipline as a generated migration.
 *
 * ## It MERGES, and it has to
 *
 * The database is not a complete copy of this file. `note` — the USDA
 * description each `sourceRef` carried when the dataset was generated — is in
 * the file and is not written to `catalog_foods` by the seed: 143 of the 145
 * shared rows have a null `source_note`. A straight "write the database out"
 * would therefore delete the note from every one of them, and `db:seed:dishes`
 * asserts against exactly that field to catch an fdcId that has drifted onto a
 * different food.
 *
 * So each food is written as the file's existing entry with the database's
 * values laid over it, and the file's order is preserved. A food the file has
 * never seen is appended. Nothing the database does not own is touched.
 *
 * ## What it deliberately leaves to `db:build-catalog`
 *
 * `nutrition` and `portions` are derived from `data/usda-sr-legacy.ndjson` by
 * that script, which knows nothing of hand corrections and would put the USDA
 * figures back. Rather than fight it, the platform panel does not edit them —
 * it edits names, category, state and the active flag, which are curated rather
 * than derived. This script carries the same split: it writes those through and
 * takes nutrition, portions and note from whichever side already has them.
 *
 * ## Shared rows only
 *
 * A clinic's private foods (`clinic_id is not null`) are that dietitian's
 * records, never committed to this repository, and this script cannot see them.
 * The same rule `seed-catalog-foods.ts` states in the other direction.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { asc, isNull } from 'drizzle-orm';

import { db } from '../src/db';
import { catalogFoodAliases, catalogFoodPortions, catalogFoods } from '../src/db/schema';

import { normalizeArabic } from '../src/features/weekly-plans/arabic-normalize';

import { catalogChecksum } from './build-catalog-dataset';

const CATALOG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'catalog-foods.json');

/**
 * Every nutrient the file can carry.
 *
 * **The order here is only a fallback**, because the committed file does not
 * have one order. A USDA-derived food writes `protein, carbs, fat` and the two
 * hand-authored ones write `protein, fat, carbs`; both are in
 * `data/catalog-foods.json` today. The checksum is taken over
 * `JSON.stringify(foods)`, so key order is part of the identity of the file —
 * which means a fixed list cannot reproduce it and `nutritionFor` below keeps
 * each entry's own order instead.
 */
const NUTRIENT_KEYS = [
  'kcal',
  'protein',
  'carbs',
  'fat',
  'fiber',
  'sugar',
  'saturatedFat',
  'sodium',
  'cholesterol',
  'calcium',
  'iron',
  'potassium',
] as const;

/** The portion fields the database owns; anything else in the file is carried through. */
const PORTION_COLUMNS = new Set([
  'key',
  'labelAr',
  'labelEn',
  'grams',
  'isDefault',
  'sortOrder',
]);

type ExportedFood = Record<string, unknown> & { slug?: unknown };

/**
 * The database's nutrition, written in the key order the file already used.
 *
 * See `NUTRIENT_KEYS` for why that order is read off the file rather than
 * declared: there is more than one in use, and rewriting either would change the
 * checksum of a file whose data has not changed.
 */
function nutritionFor(
  values: Record<string, number | null>,
  before: unknown,
): Record<string, number | null> {
  const authored = before && typeof before === 'object' ? Object.keys(before) : [];
  const keys = [...authored, ...NUTRIENT_KEYS.filter((key) => !authored.includes(key))];

  const out: Record<string, number | null> = {};
  for (const key of keys) out[key] = values[key] ?? null;
  return out;
}

/**
 * The database's aliases, in the order the file already lists them.
 *
 * Two things make this more than a sort, and both were found by the checksum
 * refusing to settle on a round trip that changed nothing.
 *
 * **Order is the file's.** `data/catalog-foods.json` lists synonyms in the order
 * a person wrote them; sorting them rewrites all 145 foods to say nothing.
 *
 * **Matching is on the NORMALISED name, not the literal one.** Aliases are
 * upserted on `(food_id, normalized_name)`, so several authored spellings
 * collapse to one row — رز, ارز and أرز are one alias in the database and three
 * lines in the file. Comparing literals would drop the spellings that lost the
 * race on every export, quietly narrowing the search terms a dietitian can type.
 * Comparing normalised forms keeps every authored spelling whose alias still
 * exists, while an alias genuinely deleted from the database still disappears.
 */
function inFileOrder(fromDb: readonly string[], fromFile: unknown): string[] {
  const authored = Array.isArray(fromFile) ? (fromFile as string[]) : [];

  const heldNormalised = new Set(fromDb.map(normalizeArabic));
  const authoredNormalised = new Set(authored.map(normalizeArabic));

  const kept = authored.filter((name) => heldNormalised.has(normalizeArabic(name)));
  const added = fromDb.filter((name) => !authoredNormalised.has(normalizeArabic(name))).sort();

  return [...kept, ...added];
}

/**
 * The file's foods, in the order they are written, keyed by slug.
 *
 * Order is preserved rather than sorted, so the committed diff after an edit is
 * the edit — not 145 moved blocks with one changed line somewhere inside them.
 */
async function buildFoods(existing: readonly ExportedFood[]): Promise<ExportedFood[]> {
  const [foods, aliases, portions] = await Promise.all([
    db
      .select()
      .from(catalogFoods)
      .where(isNull(catalogFoods.clinicId))
      .orderBy(asc(catalogFoods.slug)),
    db.select().from(catalogFoodAliases),
    db.select().from(catalogFoodPortions).orderBy(asc(catalogFoodPortions.sortOrder)),
  ]);

  const aliasesByFood = new Map<string, { ar: string[]; en: string[] }>();
  for (const alias of aliases) {
    const held = aliasesByFood.get(alias.foodId) ?? { ar: [], en: [] };
    // `locale`, not `language`. The column is named `locale` and reading a
    // field that does not exist gave every alias `undefined`, which is not 'ar',
    // which put every Arabic synonym into `aliasesEn`. The checksum caught it.
    (alias.locale === 'ar' ? held.ar : held.en).push(alias.name);
    aliasesByFood.set(alias.foodId, held);
  }

  const portionsByFood = new Map<string, typeof portions>();
  for (const portion of portions) {
    const held = portionsByFood.get(portion.foodId) ?? [];
    held.push(portion);
    portionsByFood.set(portion.foodId, held);
  }

  const previous = new Map(existing.map((food) => [food.slug as string, food]));

  const merged = foods.map((food) => {
    const held = aliasesByFood.get(food.id) ?? { ar: [], en: [] };
    const before = previous.get(food.slug);

    // Every nutrient written explicitly, `null` included — the same rule
    // `build-catalog-dataset.ts` states: an absent key cannot be told apart from
    // a key someone forgot, and "never measured" is a fact this file must state.
    const values: Record<string, number | null> = {};
    for (const key of NUTRIENT_KEYS) {
      const value = food[key as keyof typeof food];
      values[key] = typeof value === 'number' ? value : null;
    }
    const nutrition = nutritionFor(values, before?.nutrition);

    /*
      Merged onto the file's portion, not rebuilt from the row.

      A portion in `data/catalog-foods.json` may carry a `sourceRef` — one does
      today: "clinic practice, Hebron: one heaped eating spoon of cooked rice.
      Not a level measuring tablespoon." The database has no column for it, so
      building a fresh object dropped it.

      Matched on `key`, which is what the seed upserts portions on. It matched on
      `label_en` until the portion contract moved identity onto the key; a rename
      would have orphaned the authored half of a row and quietly dropped it.
    */
    const beforePortions = Array.isArray(before?.portions)
      ? (before.portions as Record<string, unknown>[])
      : [];
    const beforeByKey = new Map(beforePortions.map((portion) => [portion.key, portion]));

    const portionRows = (portionsByFood.get(food.id) ?? []).map((portion) => {
      const authored = beforeByKey.get(portion.key) ?? {};

      // The extras go LAST, matching where the file writes them. Spreading the
      // authored object first put `sourceRef` at the head of the object, which
      // is a different `JSON.stringify` and therefore a different checksum for
      // a portion whose data had not changed.
      const extras = Object.fromEntries(
        Object.entries(authored).filter(([field]) => !PORTION_COLUMNS.has(field)),
      );

      return {
        key: portion.key,
        labelAr: portion.labelAr,
        labelEn: portion.labelEn,
        grams: portion.grams,
        isDefault: portion.isDefault,
        sortOrder: portion.sortOrder,
        ...extras,
      };
    });

    return {
      // The file's entry first, so any key this script does not know about
      // survives rather than being dropped by a rewrite.
      ...before,
      slug: food.slug,
      nameAr: food.nameAr,
      nameEn: food.nameEn,
      state: food.state,
      category: food.category,
      sourceType: food.sourceType,
      sourceRef: food.sourceRef,
      /*
        The FILE's note wins, and the column is only a fallback.

        `note` is the USDA description a `sourceRef` carried when the dataset was
        generated, and `seed-dishes.ts` asserts against it to catch an fdcId that
        has drifted onto a different food. `catalog_foods.source_note` is a
        different thing that happens to share a name — on the two hand-authored
        rows it holds a provenance paragraph ("manufacturer panel, read
        2026-09-02, PROVISIONAL…"), which is worth keeping in the database and
        would break the assertion if it were written here.
      */
      note: before?.note ?? food.sourceNote ?? null,
      aliasesAr: inFileOrder(held.ar, before?.aliasesAr),
      aliasesEn: inFileOrder(held.en, before?.aliasesEn),
      nutrition,
      portions: portionRows,
    } satisfies ExportedFood;
  });

  // File order first, then anything the file has never seen, alphabetically.
  const order = new Map(existing.map((food, index) => [food.slug as string, index]));
  const rank = (slug: string) => order.get(slug) ?? Number.MAX_SAFE_INTEGER;

  return merged.sort(
    (a, b) => rank(a.slug) - rank(b.slug) || String(a.slug).localeCompare(String(b.slug)),
  );
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const existing = JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as {
    $comment?: string;
    checksum?: string;
    foods?: ExportedFood[];
  };

  const foods = await buildFoods(existing.foods ?? []);

  if (!foods.length) {
    throw new Error('The database holds no shared catalog foods. Refusing to write an empty catalog.');
  }

  const output = {
    $comment: existing.$comment,
    checksum: catalogChecksum(foods),
    foods,
  };

  const before = existing.foods?.length ?? 0;
  const changed = output.checksum !== existing.checksum;

  console.info(`database: ${foods.length} shared foods; file: ${before}`);
  console.info(changed ? `checksum ${existing.checksum} -> ${output.checksum}` : 'no change');

  if (changed && process.env.EXPORT_DIFF) {
    const before = existing.foods ?? [];
    for (const [index, food] of foods.entries()) {
      const was = before[index];
      if (JSON.stringify(food) !== JSON.stringify(was)) {
        console.info(`  first difference at index ${index}: ${String(food.slug)} vs ${String(was?.slug)}`);
        for (const key of new Set([...Object.keys(food), ...Object.keys(was ?? {})])) {
          const a = JSON.stringify((food as Record<string, unknown>)[key]);
          const b = JSON.stringify((was as Record<string, unknown>)?.[key]);
          if (a !== b) console.info(`    ${key}:
      db   ${a?.slice(0, 200)}
      file ${b?.slice(0, 200)}`);
        }
        break;
      }
    }
  }

  if (!changed) return;

  if (!apply) {
    console.info('\nnothing written. Re-run with --apply to update data/catalog-foods.json.');
    return;
  }

  // CRLF, matching the other committed data files on this repository.
  writeFileSync(CATALOG_PATH, `${JSON.stringify(output, null, 2)}\n`.replace(/\n/g, '\r\n'));
  console.info('\nwrote data/catalog-foods.json. Commit it.');
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

process.exit(0);
