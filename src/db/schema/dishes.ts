import { boolean, index, integer, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { catalogFoodPortions, catalogFoods } from './catalog-foods';
import { clinics } from './clinics';

/**
 * The approved dish catalog — the only thing weekly-plan generation may choose
 * from.
 *
 * Shared dishes have `clinic_id = null` and are visible to every clinic, the way
 * `catalog_foods` is: a curated dish is closer to reference data than to a tenant's
 * record, and one seeded catalog beats every clinic seeding an identical copy. A
 * clinic may also add its own dishes, with `clinic_id` set to that clinic — those
 * are visible only to it. A clinic that does not want a shared dish hides it via
 * `clinic_hidden_dishes` rather than deleting or editing the shared row.
 *
 * Seeded from `data/dishes.json` by `bun run db:seed:dishes`. Read-only in the
 * application beyond that: nothing in the UI writes here.
 *
 * A dish carries no nutrition of its own. Its composition is `dish_ingredients`
 * pointing at `catalog_foods`, and every number the UI shows is derived from those at read
 * time by `src/features/weekly-plans/nutrition.ts`. This is the whole reason
 * the AI cannot invent a calorie count: the only things it emits are a dish slug
 * and a serving multiplier.
 */
export const dishes = pgTable(
  'dishes',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * The owning clinic, or null for a shared built-in dish. Null dishes are
     * visible to every clinic; a set value scopes the dish to one clinic.
     */
    clinicId: uuid('clinic_id').references(() => clinics.id, { onDelete: 'cascade' }),

    /**
     * The stable natural key, e.g. `mujaddara-salad`.
     *
     * Serves the same purpose as `catalog_foods.slug`: a re-seed updates rows in place
     * rather than orphaning every plan row that references them. It is also what
     * the model returns — plan generation sends the catalog as slugs and gets
     * slugs back, so the id never leaves the server.
     */
    slug: text('slug').notNull(),

    /** What the dietitian and the client actually read. */
    nameAr: text('name_ar').notNull(),
    nameEn: text('name_en').notNull(),

    /**
     * Which slots this dish suits: `breakfast`, `snack`, `lunch`, `dinner`.
     *
     * A plain text array rather than a join table — the values are a closed set
     * validated by Zod, and nothing needs to be said *about* the pairing. Same
     * reasoning as the enum-like `text` columns on `clients`.
     */
    mealTypes: text('meal_types').array().notNull(),

    /**
     * The **practical** tags only: `economical`, `quick`, `easy_prep`,
     * `no_cook`, `portable`, `filling`, `local`, `vegetarian` — the closed set in
     * `DISH_TAGS` (`schema.ts`).
     *
     * These are what a dietitian's weekly instruction resolves against: "lower
     * cost" and "portable meals" are only actionable because the catalog says
     * which dishes are which. Nutrition is NOT here — "high protein" is computed
     * from the recipe by `nutritionCategory()`, the single source of truth, so a
     * dish can never be hand-tagged to contradict its own food. Disease
     * suitability is not here either; it is a patient-specific rule, not a dish
     * boolean.
     */
    tags: text('tags').array().notNull(),

    /**
     * `nuts`, `lactose`, `gluten`, `egg`, `fish`, `sesame`.
     *
     * The catalog is filtered on this column in SQL before a payload is ever
     * built, so a client's allergy is enforced before the model sees the options.
     * Allergy safety must not depend on a model reading its instructions.
     */
    allergenTags: text('allergen_tags').array().notNull(),

    /** e.g. "حصة واحدة" — what one unit of `dish_ingredients` adds up to. */
    baseServingLabel: text('base_serving_label').notNull(),

    /** Retired dishes stay for the plans that reference them, but stop being offered. */
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // What makes the seed an upsert rather than a duplicate on every run.
    uniqueIndex('dishes_slug_idx').on(table.slug),
    // Generation reads the whole active catalog, every time.
    index('dishes_is_active_idx').on(table.isActive),
    index('dishes_clinic_id_idx').on(table.clinicId),
  ],
);

/** One food, in one dish, at the quantity for a single base serving. */
export const dishIngredients = pgTable(
  'dish_ingredients',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    dishId: uuid('dish_id')
      .notNull()
      .references(() => dishes.id, { onDelete: 'cascade' }),

    /**
     * The canonical food this line is made of — the one live nutrition reference.
     *
     * `restrict`, not `cascade`: a re-seed that silently emptied a recipe would put
     * wrong numbers in front of a client. Deleting a food that is in use fails
     * loudly instead.
     *
     * NOT NULL since Phase 2. The transitional `food_id` that pointed at the USDA
     * `foods` table is gone, so there is exactly one food identity on this row and
     * a line with no food cannot exist.
     */
    catalogFoodId: uuid('catalog_food_id')
      .notNull()
      .references(() => catalogFoods.id, { onDelete: 'restrict' }),

    /**
     * Grams for ONE base serving, and the **authoritative** quantity.
     *
     * Every nutrition figure in the product comes from this column through the
     * per-100 g pipeline in `nutrition.ts`. The two columns below record how the
     * dietitian typed it; neither is ever an input to a calculation.
     */
    quantityGrams: real('quantity_grams').notNull(),

    /**
     * The catalog portion the amount was entered in, when it was not grams.
     *
     * `set null`, not `restrict` or `cascade`: if a portion is later retired the
     * recipe must keep the grams it was saved with and simply stop being able to
     * say "2 حبة". Losing the unit is a display downgrade; losing or blocking the
     * weight would be a clinical one.
     */
    portionId: uuid('portion_id').references(() => catalogFoodPortions.id, {
      onDelete: 'set null',
    }),

    /** How many of `portion_id` were entered. Null exactly when `portion_id` is. */
    portionQuantity: real('portion_quantity'),

    sortOrder: integer('sort_order').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('dish_ingredients_dish_id_idx').on(table.dishId, table.sortOrder)],
);

/**
 * A clinic's decision to hide a shared dish it does not use.
 *
 * Only ever references shared dishes; a clinic's own dishes are removed by
 * deleting them, not hidden. One row per (clinic, dish) — hiding twice is the
 * same as hiding once.
 */
export const clinicHiddenDishes = pgTable(
  'clinic_hidden_dishes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clinicId: uuid('clinic_id')
      .notNull()
      .references(() => clinics.id, { onDelete: 'cascade' }),
    dishId: uuid('dish_id')
      .notNull()
      .references(() => dishes.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('clinic_hidden_dishes_clinic_dish_idx').on(table.clinicId, table.dishId)],
);

export type Dish = typeof dishes.$inferSelect;
export type NewDish = typeof dishes.$inferInsert;
export type DishIngredient = typeof dishIngredients.$inferSelect;
export type NewDishIngredient = typeof dishIngredients.$inferInsert;
export type ClinicHiddenDish = typeof clinicHiddenDishes.$inferSelect;
export type NewClinicHiddenDish = typeof clinicHiddenDishes.$inferInsert;
