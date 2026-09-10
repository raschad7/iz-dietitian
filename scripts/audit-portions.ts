/**
 * What the portion contract says about the catalog we already ship.
 *
 *   bun run scripts/audit-portions.ts
 *
 * Reads `data/catalog-foods.json` and `data/dishes.json` and answers one
 * question: **which portion weights are worth a dietitian's time, and in what
 * order.**
 *
 * The order is the point. Every unreviewed portion is a candidate for review, and
 * a list of three hundred of them is a list nobody works through. A wrong weight
 * on a food that appears in one dessert costs almost nothing; the same error on
 * cooked rice moves sixty recipe lines and most of the week. So each finding is
 * weighted by how many recipe lines actually reference that food in that unit.
 *
 * Nothing here writes. It is a reading of committed data.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { measureOf, type PortionKey } from '@/features/weekly-plans/portion-contract';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

type Portion = {
  key: PortionKey;
  labelAr: string;
  labelEn: string;
  grams: number;
  isDefault: boolean;
  evidence?: { kind: string; source: string; note?: string };
  reviewStatus?: string;
};

type Food = {
  slug: string;
  nameAr: string;
  nameEn: string;
  category: string;
  countedAs?: PortionKey;
  portions: Portion[];
};

type Dish = { slug: string; ingredients: { fdcId: number; unit?: string; count?: number }[] };

/**
 * Categories a dietitian serves by the heaped eating spoon.
 *
 * Not a guess about the food so much as about the sentence: «٦ ملاعق أرز» and
 * «ملعقتين لبنة» are heaped, «ملعقة زيت» is levelled. Grains, legumes and the
 * dairy spreads fall on one side of that line and oils, spreads and spices on the
 * other, which is why a spoon of olive oil at 13.5 g is right and a spoon of
 * bulgur at 8.4 g is not.
 */
const HEAPED_BY_PRACTICE = new Set(['grains', 'legumes']);

/** Foods in `dairy` that are spooned as a dollop rather than poured or measured. */
const SPOONED_DAIRY = new Set(['labaneh', 'yogurt-whole', 'yogurt-lowfat', 'cream-cheese']);

function likelyHeaped(food: Food): boolean {
  if (HEAPED_BY_PRACTICE.has(food.category)) return true;
  return SPOONED_DAIRY.has(food.slug);
}

function main(): void {
  const foods = (
    JSON.parse(readFileSync(join(ROOT, 'data/catalog-foods.json'), 'utf8')) as { foods: Food[] }
  ).foods;
  const dishFile = JSON.parse(readFileSync(join(ROOT, 'data/dishes.json'), 'utf8')) as
    | { dishes: Dish[] }
    | Dish[];
  const dishes = Array.isArray(dishFile) ? dishFile : dishFile.dishes;

  const bySourceRef = new Map(foods.map((food) => [String((food as never)['sourceRef']), food]));

  /* How many recipe lines name this food in this unit. The weight of a finding. */
  const uses = new Map<string, number>();
  for (const dish of dishes) {
    for (const line of dish.ingredients ?? []) {
      const food = bySourceRef.get(String(line.fdcId));
      if (!food || !line.unit) continue;
      const at = `${food.slug}:${line.unit}`;
      uses.set(at, (uses.get(at) ?? 0) + 1);
    }
  }

  const findings: { lines: number; label: string; detail: string }[] = [];
  const statuses = new Map<string, number>();
  const evidence = new Map<string, number>();

  for (const food of foods) {
    for (const portion of food.portions ?? []) {
      const status = portion.reviewStatus ?? 'needs_review';
      statuses.set(status, (statuses.get(status) ?? 0) + 1);
      const kind = portion.evidence?.kind ?? 'unrecorded';
      evidence.set(kind, (evidence.get(kind) ?? 0) + 1);

      /*
        The finding that matters: a food a dietitian spoons by the dollop, whose
        spoon is USDA's levelled 15 ml. The label reads ملعقة كبيرة either way, so
        a plan writing six of them means one thing and computes another.
      */
      if (portion.key === 'level-tablespoon' && likelyHeaped(food)) {
        const lines = uses.get(`${food.slug}:level-tablespoon`) ?? 0;
        const counted = food.countedAs === 'level-tablespoon' ? ' — and it is the counted unit' : '';
        findings.push({
          lines,
          label: `${food.nameAr} (${food.slug})`,
          detail: `${portion.grams} g per ${portion.labelAr}, a level measuring spoon${counted}`,
        });
      }
    }
  }

  findings.sort((a, b) => b.lines - a.lines || a.label.localeCompare(b.label));

  console.info('Portion review queue');
  console.info('====================\n');

  console.info(`${foods.length} foods, ${foods.reduce((n, f) => n + (f.portions?.length ?? 0), 0)} portions\n`);

  console.info('Review status:');
  for (const [status, count] of [...statuses].sort((a, b) => b[1] - a[1])) {
    console.info(`  ${status.padEnd(14)} ${count}`);
  }

  console.info('\nWhere the weights came from:');
  for (const [kind, count] of [...evidence].sort((a, b) => b[1] - a[1])) {
    console.info(`  ${kind.padEnd(18)} ${count}`);
  }

  console.info('\nSpoons that are probably the wrong object, most-used first:');
  console.info('(a food served by the heaped spoon whose spoon is USDA\'s levelled 15 ml)\n');

  if (!findings.length) console.info('  none');
  for (const finding of findings) {
    const weight = finding.lines === 1 ? '1 recipe line' : `${finding.lines} recipe lines`;
    console.info(`  ${String(finding.lines).padStart(3)}  ${finding.label}`);
    console.info(`       ${finding.detail} · ${weight}`);
  }

  console.info('\nAlready settled:');
  for (const food of foods) {
    for (const portion of food.portions ?? []) {
      if (portion.reviewStatus !== 'reviewed') continue;
      const lines = uses.get(`${food.slug}:${portion.key}`) ?? 0;
      console.info(
        `  ${food.nameAr} · ${portion.labelAr} = ${portion.grams} g (${measureOf(portion.key)}) · ${lines} recipe lines`,
      );
      if (portion.evidence) console.info(`       ${portion.evidence.source}`);
    }
  }
}

main();
