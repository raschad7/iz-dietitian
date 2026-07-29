/**
 * Rebuilds `data/usda-sr-legacy.ndjson` from the upstream USDA release.
 *
 *   bun run scripts/build-food-dataset.ts
 *
 * This is a maintenance tool, not part of any build. The generated file is
 * committed, so `bun run db:seed` works offline and seeds the same rows on every
 * machine — running this again should produce a no-op diff.
 *
 * Source: USDA FoodData Central, "SR Legacy" (April 2018), 7,793 generic foods
 * with up to 150 components each. Chosen over the alternatives because it is the
 * only FDC dataset that is both broad and clean:
 *
 *   - Foundation Foods (~300 items) is too small to plan a day's meals from.
 *   - Branded Foods (~1.9M items) is packaged supermarket SKUs, largely US-only,
 *     with manufacturer-declared numbers and no household portions worth having.
 *   - SR Legacy is generic whole foods ("Egg, whole, raw, fresh", "Rice, brown,
 *     long-grain, cooked") — which is what a dietitian actually writes a plan in.
 *
 * SR Legacy is a final release and will never be updated, so pinning the April
 * 2018 URL is correct rather than lazy.
 *
 * Licence: a work of the US federal government, public domain (17 U.S.C. § 105).
 * USDA asks for attribution; see the header written into the dataset file and
 * the citation surfaced in the meal-plan UI.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const SOURCE_URL = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_PATH = join(ROOT, 'node_modules/.cache/usda/sr_legacy.zip');
const OUTPUT_PATH = join(ROOT, 'data/usda-sr-legacy.ndjson');

/**
 * The components worth storing, keyed by FoodData Central nutrient id.
 *
 * The four macros are present on all 7,793 foods; the rest are present on 77-99%
 * of them, so every field but `kcal` and the macros is optional downstream.
 * Units are fixed by FDC and are per 100 g of the food as described.
 */
const NUTRIENTS = {
  '1008': 'kcal', // Energy, KCAL
  '1003': 'protein', // G
  '1004': 'fat', // Total lipid (fat), G
  '1005': 'carbs', // Carbohydrate, by difference, G
  '1079': 'fiber', // Fiber, total dietary, G
  '2000': 'sugar', // Sugars, total, G
  '1258': 'saturatedFat', // Fatty acids, total saturated, G
  '1253': 'cholesterol', // MG
  '1093': 'sodium', // Sodium, Na, MG
  '1087': 'calcium', // Calcium, Ca, MG
  '1089': 'iron', // Iron, Fe, MG
  '1092': 'potassium', // Potassium, K, MG
} as const;

/** Laboratory reference materials, not food. The only category dropped. */
const EXCLUDED_CATEGORY = 'Quality Control Materials';

// ---------------------------------------------------------------------------
// zip
// ---------------------------------------------------------------------------

/**
 * Reads a zip archive from memory.
 *
 * Hand-rolled rather than adding a dependency: this script runs a few times a
 * decade, and the archive uses only the two methods every zip writer emits
 * (stored and deflate). Walks the central directory, which is the only
 * authoritative index — local headers may carry zeroed sizes when a streaming
 * writer produced the file.
 */
function unzip(buffer: Buffer): Map<string, Buffer> {
  const EOCD_SIGNATURE = 0x06054b50;
  const files = new Map<string, Buffer>();

  // The end-of-central-directory record sits at the very end, after a comment of
  // up to 64 KiB. Scan backwards for its signature.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i >= buffer.length - 22 - 0xffff; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip archive: no end-of-central-directory record');

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);

  for (let entry = 0; entry < entryCount; entry += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`corrupt central directory at entry ${entry}`);
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength);

    // The local header's own name/extra lengths decide where the data starts;
    // they need not match the central directory's.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);

    if (!name.endsWith('/')) {
      if (method === 0) files.set(name, data);
      else if (method === 8) files.set(name, inflateRawSync(data));
      else throw new Error(`${name}: unsupported compression method ${method}`);
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return files;
}

// ---------------------------------------------------------------------------
// csv
// ---------------------------------------------------------------------------

/**
 * RFC 4180 reader. The USDA files quote every field and contain embedded commas
 * and doubled quotes in food descriptions, so splitting on commas is not an
 * option.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else quoted = false;
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') field += char;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Drops the header row and hands back only rows that actually have cells. */
function dataRows(files: Map<string, Buffer>, name: string): string[][] {
  const key = [...files.keys()].find((path) => path.endsWith(`/${name}`) || path === name);
  if (!key) throw new Error(`${name} missing from the archive`);

  return parseCsv(files.get(key)!.toString('utf8'))
    .slice(1)
    .filter((row) => row.length > 1);
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

type FoodRecord = {
  fdcId: number;
  description: string;
  category: string;
  portionGrams?: number;
  portionLabel?: string;
} & Partial<Record<(typeof NUTRIENTS)[keyof typeof NUTRIENTS], number>>;

/** Two decimals is finer than the source's own precision; it just avoids float noise. */
function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

async function download(): Promise<Buffer> {
  try {
    const cached = readFileSync(CACHE_PATH);
    console.info(`using cached archive (${(cached.length / 1024 / 1024).toFixed(1)} MB)`);
    return cached;
  } catch {
    // Not cached yet — fall through and fetch it.
  }

  console.info(`downloading ${SOURCE_URL}`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new Error(`download failed: ${response.status} ${response.statusText}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, buffer);
  console.info(`downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);

  return buffer;
}

async function build(): Promise<void> {
  const archive = await download();
  const files = unzip(archive);

  const categories = new Map(dataRows(files, 'food_category.csv').map((row) => [row[0]!, row[2] ?? '']));
  const units = new Map(dataRows(files, 'measure_unit.csv').map((row) => [row[0]!, row[1] ?? '']));

  const foods = new Map<string, FoodRecord>();

  for (const [fdcId, , description, categoryId] of dataRows(files, 'food.csv')) {
    const category = categories.get(categoryId ?? '');
    if (!fdcId || !description || !category || category === EXCLUDED_CATEGORY) continue;

    foods.set(fdcId, { fdcId: Number(fdcId), description, category });
  }

  for (const row of dataRows(files, 'food_nutrient.csv')) {
    const key = NUTRIENTS[row[2] as keyof typeof NUTRIENTS];
    const food = key ? foods.get(row[1] ?? '') : undefined;
    if (!food) continue;

    const amount = Number(row[3]);
    if (Number.isFinite(amount)) food[key!] = round(amount, 2);
  }

  /**
   * One household measure per food — "1 large", "1 cup", "1 fillet" — so the UI
   * can offer something better than "type a number of grams". `food_portion.csv`
   * is ordered by `seq_num`, and the first portion is the representative one.
   */
  for (const row of dataRows(files, 'food_portion.csv')) {
    const food = foods.get(row[1] ?? '');
    if (!food || food.portionGrams !== undefined) continue;

    const grams = Number(row[7]);
    if (!Number.isFinite(grams) || grams <= 0) continue;

    const amount = Number(row[3]);
    const unit = units.get(row[4] ?? '') ?? '';

    /**
     * The label always leads with its own count — "1 large", "3 oz", "1 cup" —
     * so it is self-contained. Callers render it as-is; a UI that prefixed its
     * own "1 " would produce "1 3 oz" on the many portions whose amount is not 1.
     */
    const label = [
      Number.isFinite(amount) && amount > 0 ? String(amount) : '1',
      unit === 'undetermined' ? '' : unit,
      (row[6] ?? '').trim(),
    ]
      .filter(Boolean)
      .join(' ');

    food.portionGrams = round(grams, 1);
    food.portionLabel = label;
  }

  // Energy is the one field the UI cannot render a row without. Every SR Legacy
  // food has it today; the filter is here so a future re-run degrades by
  // dropping a food rather than by seeding a NULL calorie count.
  const records = [...foods.values()]
    .filter((food) => typeof food.kcal === 'number')
    .sort((a, b) => a.fdcId - b.fdcId);

  const body = records.map((record) => JSON.stringify(record)).join('\n');

  /**
   * NDJSON, not JSON: one food per line keeps the committed file reviewable in a
   * diff and lets the seed stream it instead of holding a 2.4 MB parse in memory.
   * The `#` header line is metadata; the seed skips it.
   */
  const header = `#{"source":"USDA FoodData Central, SR Legacy (April 2018)","url":"${SOURCE_URL}","licence":"public domain (17 U.S.C. 105)","basis":"per 100 g","foods":${records.length},"generatedBy":"scripts/build-food-dataset.ts"}`;

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${header}\n${body}\n`);

  const digest = createHash('sha256').update(body).digest('hex').slice(0, 12);
  const withPortion = records.filter((record) => record.portionGrams !== undefined).length;

  console.info(`wrote ${records.length} foods to data/usda-sr-legacy.ndjson (content ${digest})`);
  console.info(`  ${withPortion} have a household portion, ${new Set(records.map((r) => r.category)).size} categories`);
}

await build();
process.exit(0);
