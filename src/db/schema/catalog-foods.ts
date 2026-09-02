import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { clinics } from './clinics';

/**
 * The canonical food catalog — what the dietitian actually searches and builds
 * recipes from.
 *
 * This replaces `foods` (7,793 USDA SR Legacy rows) as the product's food library.
 * USDA stays in the database as an internal nutrition reference and as the source
 * every verified row here was copied from, but it is no longer reachable from the
 * ingredient picker: a catalog of 954 beef cuts, 312 fast foods, 345 baby foods and
 * 186 alcohol rows, with no Arabic names and a runtime heuristic guessing at them,
 * is a reference dataset that was doing a product's job.
 *
 * Two populations, exactly as `foods` had, and the same rule: `clinic_id = null` is
 * a shared row every clinic sees, a set `clinic_id` is private to that clinic. A
 * clinic food never becomes a shared one by having its `clinic_id` changed —
 * promotion, if it is ever built, means inserting a new shared row.
 *
 * EVERY nutrient column is "amount per 100 g of the food as described", the basis
 * `scaleNutrients` unwinds. Nothing here is stored per serving.
 */
export const catalogFoods = pgTable(
  'catalog_foods',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** The owning clinic, or null for a shared catalog food. */
    clinicId: uuid('clinic_id').references(() => clinics.id, { onDelete: 'cascade' }),

    /**
     * The stable natural key, e.g. `rice-white-cooked`.
     *
     * Same job as `foods.fdc_id` and `dishes.slug`: a re-seed updates rows in place
     * rather than orphaning every recipe that points at them.
     */
    slug: text('slug').notNull(),

    /** First-class stored names. Neither is derived, guessed, or translated at runtime. */
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),

    /**
     * `normalizeArabic()` applied to each name, stored rather than computed.
     *
     * This is what makes search an indexed SQL predicate instead of loading the
     * table and normalising in JS, which is what the old clinic-food search had to
     * do. Written by the seed and by `createCustomFood`; never by hand.
     */
    normalizedNameAr: text('normalized_name_ar').notNull(),
    normalizedNameEn: text('normalized_name_en').notNull(),

    /**
     * The preparation state, explicit and never merged.
     *
     * Raw rice and cooked rice are different foods with different nutrition per
     * 100 g, and a catalog entry called simply "rice" is a portion error waiting to
     * happen. One of: `raw`, `cooked`, `dry`, `canned`, `dried`, `roasted`,
     * `prepared`.
     */
    state: text('state').notNull(),

    /**
     * A small canonical category, NOT one of USDA's 25 food groups.
     *
     * Read by `ingredient-units.ts` to decide whether a household unit is offered
     * at all — meat, poultry and fish go by grams.
     */
    category: text('category').notNull(),

    /**
     * The unit this food is **always** counted in — the `label_en` of one of its
     * own portions — or null when it is measured by weight.
     *
     * An egg is a حبة, bread is a رغيف, cooked rice is a ملعقة. Before this column
     * the recipe author decided per line, which is how the same egg appeared as
     * "1 حبة" in one dish and "50 غ" in another. The seed refuses a recipe line
     * that contradicts it.
     *
     * It matters more than it looks. Whole wheat pita is *fewer* calories per
     * 100 g than white, but the loaf weighs 100 g instead of 60, so the loaf
     * carries more. Only the unit tells that story; the gram hides it.
     */
    countedAs: text('counted_as'),

    kcal: real('kcal').notNull(),
    protein: real('protein').notNull(),
    fat: real('fat').notNull(),
    carbs: real('carbs').notNull(),

    /**
     * Nullable, and null means "never measured" — NOT zero. `sumNutrients` skips a
     * null and counts it as unmeasured instead, which is the distinction the whole
     * feature is built on. The migration copies nulls across as nulls.
     */
    fiber: real('fiber'),
    sugar: real('sugar'),
    saturatedFat: real('saturated_fat'),
    cholesterol: real('cholesterol'),
    sodium: real('sodium'),
    calcium: real('calcium'),
    iron: real('iron'),
    potassium: real('potassium'),

    /**
     * `verified` | `provisional` | `needs_review`.
     *
     * `verified` means the nutrition came from a named source and the names were
     * curated deliberately. `needs_review` flags a row whose name was carried over
     * mechanically because the repository held no evidence to curate it safely —
     * honest, and searchable later.
     */
    verificationStatus: text('verification_status').notNull().default('provisional'),

    /** `usda_sr_legacy` | `clinic_entered`. Where the numbers came from. */
    sourceType: text('source_type').notNull(),

    /** The upstream identifier, e.g. an FDC id as text. Null for clinic-entered rows. */
    sourceRef: text('source_ref'),

    /** Retired foods stay for the recipes that use them, but stop being offered. */
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Two partial uniques rather than one composite: a plain unique on
    // (clinic_id, slug) would not constrain the shared rows at all, because
    // PostgreSQL treats every NULL clinic_id as distinct.
    uniqueIndex('catalog_foods_shared_slug_idx')
      .on(table.slug)
      .where(sql`clinic_id is null`),
    uniqueIndex('catalog_foods_clinic_slug_idx')
      .on(table.clinicId, table.slug)
      .where(sql`clinic_id is not null`),
    index('catalog_foods_clinic_id_idx').on(table.clinicId),
    index('catalog_foods_normalized_ar_idx').on(table.normalizedNameAr),
    index('catalog_foods_normalized_en_idx').on(table.normalizedNameEn),
  ],
);

/**
 * Arabic and English synonyms for a catalog food, stored as data.
 *
 * This is the table that replaces the runtime translation path — the AI call that
 * turned an Arabic name into English keywords, and the `FOOD_BASES` heuristic that
 * guessed an Arabic label back out of a USDA description and got `Eggplant, raw`
 * wrong (it matched `egg` before `eggplant` and labelled it بيض).
 *
 * Scope is inherited from the food: an alias on a shared food is visible to
 * everyone, an alias on a clinic's food is visible to that clinic. There is
 * deliberately no `clinic_id` here — one scope, held in one place, cannot disagree
 * with itself.
 */
export const catalogFoodAliases = pgTable(
  'catalog_food_aliases',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    foodId: uuid('food_id')
      .notNull()
      .references(() => catalogFoods.id, { onDelete: 'cascade' }),

    /** As written, for display if it is ever needed. */
    name: text('name').notNull(),

    /** `normalizeArabic(name)` — what search actually matches against. */
    normalizedName: text('normalized_name').notNull(),

    /** `ar` | `en`. */
    locale: text('locale').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Makes the seed an upsert and stops a synonym being recorded twice.
    uniqueIndex('catalog_food_aliases_food_name_idx').on(table.foodId, table.normalizedName),
    index('catalog_food_aliases_normalized_idx').on(table.normalizedName),
  ],
);

/**
 * The household measures a food may be entered in — a cup of rice, a رغيف of
 * pita, a tablespoon of olive oil — and what each one weighs.
 *
 * Replaces the single `portion_grams` / `portion_label` pair the catalog inherited
 * from `foods`. One measure per food was never enough: olive oil is written in both
 * tablespoons and teaspoons, rice in cups and half-cups, and the old model could
 * hold exactly one of each pair — so the rest were re-derived in the browser on
 * every keystroke from a USDA string. They are rows now, so a wrong portion is a
 * row someone can fix rather than a heuristic nobody can reach.
 *
 * **Grams remain the nutrition basis.** A portion is a data-entry convenience: the
 * editor multiplies it out and stores grams on the ingredient. Nothing here is ever
 * an input to `dishTotals`, which is why a food with no portions still works
 * perfectly and why changing a portion's weight cannot move an existing recipe.
 *
 * Scope is inherited from the food, exactly as aliases are: a portion on a shared
 * food is everyone's, a portion on a clinic's food is that clinic's. There is
 * deliberately no `clinic_id` here — one scope, held in one place, cannot disagree
 * with itself.
 */
export const catalogFoodPortions = pgTable(
  'catalog_food_portions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    foodId: uuid('food_id')
      .notNull()
      .references(() => catalogFoods.id, { onDelete: 'cascade' }),

    /** Stored separately, never translated at runtime. "كوب" / "Cup". */
    labelAr: text('label_ar').notNull(),
    labelEn: text('label_en').notNull(),

    /** What one of this portion weighs. Constrained positive — a zero-gram unit converts nothing. */
    grams: real('grams').notNull(),

    /** The portion a freshly picked food starts in. At most one per food. */
    isDefault: boolean('is_default').notNull().default(false),

    sortOrder: integer('sort_order').notNull().default(0),

    /** Where the weight came from, when it is not simply the food's own source. */
    sourceRef: text('source_ref'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // What makes the seed an upsert: re-running it updates a portion's weight in
    // place rather than adding a second "Cup" beside the first.
    uniqueIndex('catalog_food_portions_food_label_idx').on(table.foodId, table.labelEn),
    // Two defaults would make "which unit does this food start in" unanswerable.
    uniqueIndex('catalog_food_portions_default_idx')
      .on(table.foodId)
      .where(sql`is_default`),
    index('catalog_food_portions_food_id_idx').on(table.foodId, table.sortOrder),
    // Enforced by the database, not only by the seed: a non-positive weight would
    // silently convert every quantity to zero grams.
    check('catalog_food_portions_grams_positive', sql`grams > 0`),
  ],
);

export type CatalogFood = typeof catalogFoods.$inferSelect;
export type NewCatalogFood = typeof catalogFoods.$inferInsert;
export type CatalogFoodAlias = typeof catalogFoodAliases.$inferSelect;
export type NewCatalogFoodAlias = typeof catalogFoodAliases.$inferInsert;
export type CatalogFoodPortion = typeof catalogFoodPortions.$inferSelect;
export type NewCatalogFoodPortion = typeof catalogFoodPortions.$inferInsert;

/** The preparation states a catalog food may declare. */
export const CATALOG_FOOD_STATES = [
  'raw',
  'cooked',
  'dry',
  'canned',
  'dried',
  'roasted',
  'prepared',
] as const;

/**
 * The canonical categories. Small on purpose: the only thing reading this is the
 * unit menu, which needs to know what a dietitian weighs rather than portions.
 */
export const CATALOG_FOOD_CATEGORIES = [
  'grains',
  'legumes',
  'vegetables',
  'fruits',
  'dairy_eggs',
  'meat',
  'poultry',
  'fish',
  'nuts_seeds',
  'fats_oils',
  'sweets',
  'herbs_spices',
  'other',
] as const;

export type CatalogFoodState = (typeof CATALOG_FOOD_STATES)[number];
export type CatalogFoodCategory = (typeof CATALOG_FOOD_CATEGORIES)[number];
