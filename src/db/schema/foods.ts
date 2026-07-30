import { index, integer, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * The food composition reference table.
 *
 * Seeded from `data/usda-sr-legacy.ndjson` (USDA FoodData Central, SR Legacy,
 * April 2018 — public domain). Read-only in the application: nothing in the UI
 * writes here, and `bun run db:seed` re-syncs it.
 *
 * Unlike every other domain table this one is NOT scoped to a clinic. Food
 * composition is a physical fact, not a tenant's data, so all clinics share one
 * copy rather than each seeding 7,793 near-identical rows.
 *
 * EVERY nutrient column is "amount per 100 g of the food as described", which is
 * the basis USDA publishes on. Portions are converted at the point of use — see
 * `scaleNutrients` in `src/features/meal-plans/nutrition.ts`. Storing anything
 * per-serving here would make the numbers impossible to sum.
 */
export const foods = pgTable(
  'foods',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The upstream FoodData Central id. Kept as the natural key so a re-seed
     * updates rows in place rather than orphaning any meal plan item that
     * references them, and so a number in this table can always be traced back
     * to its published source.
     */
    fdcId: integer('fdc_id').notNull(),

    /** USDA's own wording, e.g. "Egg, whole, raw, fresh". Never translated. */
    description: text('description').notNull(),

    /** One of the 25 SR Legacy food groups, e.g. "Vegetables and Vegetable Products". */
    category: text('category').notNull(),

    /**
     * `real`, not `numeric`: these are laboratory measurements with ~3
     * significant figures, and float4 carries far more precision than the source
     * has. `numeric` would also come back from Drizzle as a string, forcing a
     * parse at every call site for no accuracy that actually exists.
     */
    kcal: real('kcal').notNull(),
    protein: real('protein').notNull(),
    fat: real('fat').notNull(),
    carbs: real('carbs').notNull(),

    /**
     * Nullable, unlike the macros above: present on 77-99% of foods depending on
     * the nutrient. Null means "not measured", which is NOT the same as zero and
     * must never be rendered as one.
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
     * One household measure, so the dietitian can pick "1 large egg" instead of
     * doing the arithmetic. 7,533 of 7,793 foods have one; the rest fall back to
     * a plain gram entry in the UI.
     */
    portionGrams: real('portion_grams'),
    portionLabel: text('portion_label'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // What makes the seed an upsert rather than a duplicate-on-every-run.
    uniqueIndex('foods_fdc_id_idx').on(table.fdcId),
    // The picker filters by category before searching within it.
    index('foods_category_idx').on(table.category),
    // No index on description: the picker matches `ilike '%…%'`, which a btree
    // cannot serve. 7,793 rows is a few milliseconds of sequential scan.
  ],
);

export type Food = typeof foods.$inferSelect;
export type NewFood = typeof foods.$inferInsert;
