/**
 * The variety rules, enforced rather than requested.
 *
 * `prompt.ts` asks for them. This checks them, and repairs what it finds — which
 * is the difference between a rule and a hope. The plan that prompted this module
 * obeyed every instruction it was given ("do not repeat a dish more than twice")
 * and still put chickpeas in eight meals of thirty-five, and served chicken salad
 * for lunch and again for dinner on the same Monday. Neither is a dish repeating;
 * both are what a person would call the same food twice.
 *
 * So the rules here are written in the terms `dish-composition.ts` derives — what
 * the protein was, what it was eaten with — because that is what repeats.
 *
 * ## What a repair is allowed to do
 *
 * Replace one meal's dish with another from the same slot's catalog, at a portion
 * that lands on the same budget. Nothing else: it cannot move a meal to another
 * day, cannot leave a slot empty, and cannot accept a replacement that misses the
 * budget — a plan that is varied and wrong is worse than one that is repetitive
 * and right, so a violation with no good replacement is left alone.
 *
 * Pure, and separate from `generate.ts`, because the interesting question is
 * which weeks it changes and that has to be assertable without a model.
 */

import { carbBase, proteinSource, type ProteinSource } from './dish-composition';
import type { CatalogDish } from './generate';
import { chooseServings, portionedKcal, portionLine } from './portioning';
import { isFixedPortion, mealTypeForSlot } from './schema';
import { bestServings, isSimilar } from './similar';
import { evaluateDishEligibility, type PlanConstraints } from './eligibility';

/** The fields a repair reads and writes. A subset of `ReconciledMeal`. */
export type VarietyMeal = {
  dayOfWeek: number;
  slotKey: string;
  budgetKcal: number;
  dishId: string | null;
  servings: number;
  /** Cleared when a deterministic repair replaces the model's dish. */
  rationaleAr?: string | null;
};

/**
 * How often one protein source may carry the plated meals of a week.
 *
 * ## Why this counts lunches and dinners and nothing else
 *
 * The rule used to count every meal, at three uses a week, and it was wrong in a
 * way that only a real plan could show. A dietitian's own week — seven days she
 * wrote and handed to clients — uses dairy in **twelve of thirty-five meals**:
 * labneh at breakfast, a cup of milk with the fruit, yogurt sauce on the potatoes,
 * cheese in the evening. Run against the old rule, fourteen of her meals were
 * violations and the repair would have rewritten them.
 *
 * She is not being repetitive. She is doing the thing dietitians do: hold the
 * staples steady so the week is shoppable and learnable, and vary *the centre of
 * the plate*. Her seven lunches are kofta, molokhia with chicken, grilled fish,
 * ouzi with chicken, a potato-and-kofta tray, mujaddara, and home shawarma — that
 * is where the variety a client notices actually lives.
 *
 * So the cap applies to `lunch` and `dinner`, which is fourteen meals. Five
 * non-staple sources at four each is twenty, comfortably above fourteen, so the
 * rule can always be satisfied — unlike the old arithmetic, where seven sources at
 * three could cover twenty-one of thirty-five meals and the remaining fourteen had
 * to be protein-free.
 */
const MAX_WEEK_USES = 4;

/**
 * Sources that are staples rather than choices, and repeat without being noticed.
 *
 * An egg at breakfast and cheese in the evening are not "the same meal twice" in
 * any kitchen in the region. They are exempt from the weekly cap — the within-day
 * rule still applies to the plated meals, so a week cannot put cheese at both
 * lunch and dinner on one day.
 */
const STAPLE_SOURCES: ReadonlySet<ProteinSource> = new Set(['dairy', 'egg']);

/** The meals a person plates and therefore notices repeating. */
const PLATED: ReadonlySet<string> = new Set(['lunch', 'dinner']);

/**
 * How often one **dish** may appear in a week.
 *
 * The prompt has always asked for this and nothing enforced it, which was
 * invisible while the only rule with teeth was about protein: a dish repeating
 * usually repeats its protein too, and the protein ceiling caught it on the way
 * past.
 *
 * `none` is the hole. A فتوش is a bread salad and its protein source is `none`,
 * which is exempt below — so a generated week came back with فتوش at dinner on
 * Thursday, Friday and Saturday, three nights running, having broken no rule this
 * module could state. The exemption is right about *proteins* and was being asked
 * a question about *dishes*.
 *
 * Twice, not three times: a dish a client sees twice in a week is variety, and a
 * third is the point at which they notice.
 */
const MAX_DISH_WEEK_USES = 2;

/** Sources that may repeat freely: not having a protein is not a kind of protein. */
const EXEMPT: ReadonlySet<ProteinSource> = new Set(['none']);

/**
 * The kinds of dish the model actually used, which is the envelope a repair may
 * move inside.
 *
 * ## Why the plan defines its own limits
 *
 * The repair used to draw from the whole catalogue, and so it put نص منقوشة from a
 * shop into a home week, فتوش from a restaurant in front of a client with no
 * eating-out instruction, ice cream into a ketogenic week, and grilled meat into
 * the week of a client whose record says «نباتي — لا لحوم ولا دجاج ولا سمك إطلاقاً».
 * Across sixteen generated weeks it introduced nineteen festive dishes and thirteen
 * Ramadan dishes that the model itself had chosen **zero** of.
 *
 * Every one of those constraints was honoured by the model and invisible to the
 * repair, because they live in prose — the dislikes field, the standing
 * instructions, this week's note — that only a language model can read.
 *
 * Rather than teach the repair to read prose, it is confined to what the model
 * already decided was acceptable. If no festive dish was chosen, festive is out.
 * If no restaurant meal was chosen, restaurant is out. If the week holds no meat,
 * no meat can be introduced. The envelope is derived from the answer, so it costs
 * nothing to compute and cannot fall out of step with a constraint nobody
 * remembered to pass down.
 *
 * The trade is deliberate: a repair can no longer reach for a dish that would have
 * been fine. That is the correct direction to be wrong in — a week that stays
 * slightly repetitive is a week the dietitian can fix in one click, and a week that
 * feeds meat to a vegetarian is one she has to catch.
 */
export type PlanEnvelope = {
  occasions: ReadonlySet<string>;
  sources: ReadonlySet<string>;
  /**
   * Null when the plan is too small for an absence to mean anything — see
   * {@link MIN_MEALS_FOR_SOURCE_ENVELOPE}.
   */
  proteinSources: ReadonlySet<ProteinSource> | null;
};

/**
 * How many meals a plan needs before a missing protein source counts as a decision.
 *
 * `occasion` and `source` are safe to read from any plan, because the prompt
 * instructs the model on both directly: a week with no restaurant meal in it was
 * told to plan home cooking, whatever its length.
 *
 * A protein source is different. The prompt asks the model to *vary* them, so
 * absence is only evidence of a constraint when there were enough meals to show
 * one — a vegetarian week declines meat thirty-five times, while a single day that
 * happens to hold chicken twice has declined nothing. Reading an envelope off that
 * day would forbid the very swap the day-level rule exists to make.
 *
 * Fifteen sits above a single-day regeneration on any schedule and below a week on
 * every schedule this app supports, including a three-meal one.
 */
const MIN_MEALS_FOR_SOURCE_ENVELOPE = 15;

/** Reads the envelope off the meals the model chose, before anything is repaired. */
export function planEnvelope(
  meals: readonly VarietyMeal[],
  catalog: readonly CatalogDish[],
): PlanEnvelope {
  const byId = new Map(catalog.map((dish) => [dish.id, dish]));
  const occasions = new Set<string>();
  const sources = new Set<string>();
  const proteinSources = new Set<ProteinSource>();
  let filled = 0;

  for (const meal of meals) {
    const dish = meal.dishId ? byId.get(meal.dishId) : undefined;
    if (!dish) continue;

    filled += 1;
    occasions.add(dish.occasion);
    sources.add(dish.source);
    proteinSources.add(proteinSource(dish.recipe));
  }

  return {
    occasions,
    sources,
    proteinSources: filled >= MIN_MEALS_FOR_SOURCE_ENVELOPE ? proteinSources : null,
  };
}

export type VarietyReport = {
  /** Meals whose dish was replaced. */
  repaired: number;
  /** Violations no replacement could fix without missing the budget. */
  unresolved: number;
};

/**
 * Rewrites the meals that break a variety rule, in place.
 *
 * Walks the week in order and keeps the FIRST use of anything: the repair falls on
 * the later meal, which is the one a reader would call the repeat.
 *
 * Three rules, and which meals each applies to matters as much as the rule:
 *
 *  - **A dish** may appear twice a week and not twice in a day, everywhere.
 *  - **A protein source** may not repeat within a day, and may carry at most
 *    {@link MAX_WEEK_USES} of the week — but only across the *plated* meals, and
 *    not at all for the staples. See both constants for the real week that showed
 *    why counting every meal was wrong.
 *  - **A replacement stays inside the envelope** the model's own answer describes,
 *    so a repair cannot introduce a kind of dish the model declined for a reason
 *    it could read and this cannot.
 *
 * Returns what it did rather than logging it, so a caller can put the number in an
 * audit row and a test can assert on it.
 */
export function repairVariety({
  meals,
  catalog,
  allergens,
  dietPattern = null,
  proteinTargetGrams = null,
  proteinIsRestriction = false,
}: {
  meals: VarietyMeal[];
  catalog: readonly CatalogDish[];
  allergens: readonly string[];
  dietPattern?: string | null;
  /**
   * The day's protein target, so a swap can be judged on more than calories.
   *
   * Null keeps the old behaviour of ranking on energy alone. With a number, a
   * replacement that lands on the budget but strips the meal's protein is ranked
   * behind one that keeps it — which is what stopped a 143 g plate becoming a
   * 15 g one because both were near 820 kcal.
   */
  proteinTargetGrams?: number | null;
  /** An upper limit must not penalise a replacement for lowering protein. */
  proteinIsRestriction?: boolean;
}): VarietyReport {
  const byId = new Map(catalog.map((dish) => [dish.id, dish]));
  const constraints: PlanConstraints = { allergens, dietPattern };
  /* Read before anything moves: the envelope is what the MODEL chose. */
  const envelope = planEnvelope(meals, catalog);

  /** Cached, because a repair scans the catalog and every dish is asked twice. */
  const sourceOf = new Map<string, ProteinSource>();
  const source = (dish: CatalogDish): ProteinSource => {
    const held = sourceOf.get(dish.id);
    if (held) return held;

    const derived = proteinSource(dish.recipe);
    sourceOf.set(dish.id, derived);
    return derived;
  };

  const weekSources = new Map<ProteinSource, number>();
  const weekDishes = new Map<string, number>();
  const daySources = new Map<number, Set<ProteinSource>>();
  const dayDishes = new Map<number, Set<string>>();

  const report: VarietyReport = { repaired: 0, unresolved: 0 };

  for (const meal of meals) {
    if (!meal.dishId) continue;

    const dish = byId.get(meal.dishId);
    if (!dish) continue;

    const day = daySources.get(meal.dayOfWeek) ?? new Set<ProteinSource>();
    const dishes = dayDishes.get(meal.dayOfWeek) ?? new Set<string>();
    daySources.set(meal.dayOfWeek, day);
    dayDishes.set(meal.dayOfWeek, dishes);

    const plated = PLATED.has(mealTypeForSlot(meal.slotKey));
    const current = source(dish);

    /*
      A source is only counted where it is a choice. `capped` is false at
      breakfast and snacks, and false for the staples anywhere — see
      MAX_WEEK_USES and STAPLE_SOURCES for the week that proved both.
    */
    const capped = plated && !EXEMPT.has(current) && !STAPLE_SOURCES.has(current);

    const repeats =
      dishes.has(dish.id) ||
      (weekDishes.get(dish.id) ?? 0) >= MAX_DISH_WEEK_USES ||
      (plated && !EXEMPT.has(current) && day.has(current)) ||
      (capped && (weekSources.get(current) ?? 0) >= MAX_WEEK_USES);

    if (repeats) {
      const replacement = findReplacement({
        meal,
        catalog,
        constraints,
        source,
        daySources: day,
        dayDishes: dishes,
        weekSources,
        weekDishes,
        envelope,
        plated,
        proteinTargetGrams: proteinIsRestriction ? null : proteinTargetGrams,
      });

      if (replacement) {
        meal.dishId = replacement.dish.id;
        meal.servings = replacement.servings;
        meal.rationaleAr = null;
        report.repaired += 1;
      } else {
        // Nothing fits the budget. The repeat stays, and is counted so a caller can
        // say the catalog is too thin rather than that the rule was ignored.
        report.unresolved += 1;
      }
    }

    const chosen = byId.get(meal.dishId) ?? dish;

    dishes.add(chosen.id);
    countDish(weekDishes, chosen.id);

    /*
      ⚠ A source is **tallied only where it is judged**, which is lunch and dinner.

      The rule above already asks its question only of a plated meal. Recording
      every meal into the same tallies undid that: a yoghurt breakfast put `dairy`
      into the day, an egg snack put `egg` in, a handful of walnuts put `nuts` in —
      so by Friday evening a week of perfectly ordinary breakfasts had ruled out
      every dairy, egg and nut dinner in the catalog. Fifty-five dinners could reach
      that budget and thirty-two were refused for a food eaten at ten in the
      morning, and the week went out with the same chicken salad three nights.

      The dish tallies above stay unconditional: a dish repeating is a repeat
      wherever it sits.
    */
    if (plated) {
      day.add(source(chosen));
      bump(weekSources, source(chosen));
    }
  }

  return report;
}

function bump(counts: Map<ProteinSource, number>, key: ProteinSource): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** The same tally, keyed by dish id. Separate only because the key types differ. */
function countDish(counts: Map<string, number>, dishId: string): void {
  counts.set(dishId, (counts.get(dishId) ?? 0) + 1);
}

/**
 * The closest dish that fits this slot and breaks none of the rules.
 *
 * Ranked by how near its portioned energy lands to the budget, and refused
 * outright past the meal tolerance: a substitute that misses the slot by a third
 * has fixed a monotony problem by creating a nutrition one.
 */
function findReplacement({
  meal,
  catalog,
  constraints,
  source,
  daySources,
  dayDishes,
  weekSources,
  weekDishes,
  envelope,
  plated,
  proteinTargetGrams,
}: {
  meal: VarietyMeal;
  catalog: readonly CatalogDish[];
  constraints: PlanConstraints;
  source: (dish: CatalogDish) => ProteinSource;
  daySources: ReadonlySet<ProteinSource>;
  dayDishes: ReadonlySet<string>;
  weekSources: ReadonlyMap<ProteinSource, number>;
  weekDishes: ReadonlyMap<string, number>;
  /** What the model chose, and therefore what a repair may reach for. */
  envelope: PlanEnvelope;
  /** Whether the source caps apply here — see PLATED. */
  plated: boolean;
  proteinTargetGrams: number | null;
}): { dish: CatalogDish; servings: number } | null {
  const mealType = mealTypeForSlot(meal.slotKey);
  const outgoing = catalog.find((dish) => dish.id === meal.dishId);
  const outgoingProtein = outgoing ? proteinOf(outgoing, meal.budgetKcal) : 0;

  let best: { dish: CatalogDish; servings: number; score: number } | null = null;

  for (const candidate of catalog) {
    if (candidate.id === meal.dishId) continue;
    if (!candidate.mealTypes.includes(mealType)) continue;
    if (!evaluateDishEligibility(candidate, constraints).eligible) continue;
    if (dayDishes.has(candidate.id)) continue;
    // A replacement that has already carried the week twice is the repeat the
    // repair was called to remove, moved somewhere else.
    if ((weekDishes.get(candidate.id) ?? 0) >= MAX_DISH_WEEK_USES) continue;

    /*
      The envelope. A dish outside what the model chose is a dish the model had a
      reason not to choose — the client is vegetarian, the week is not Ramadan,
      they do not eat out — and the repair cannot see that reason.
    */
    if (!envelope.occasions.has(candidate.occasion)) continue;
    if (!envelope.sources.has(candidate.source)) continue;

    const candidateSource = source(candidate);
    if (envelope.proteinSources && !envelope.proteinSources.has(candidateSource)) continue;

    if (plated && !EXEMPT.has(candidateSource)) {
      if (daySources.has(candidateSource)) continue;
      if (
        !STAPLE_SOURCES.has(candidateSource) &&
        (weekSources.get(candidateSource) ?? 0) >= MAX_WEEK_USES
      ) {
        continue;
      }
    }

    const servings =
      chooseServings(candidate.recipe, meal.budgetKcal, {
        wholeOnly: isFixedPortion(candidate.source),
      }) ??
      bestServings(candidate.baseKcal, meal.budgetKcal);
    if (servings === null) continue;

    const kcal = portionedKcal(candidate.recipe, servings) || candidate.baseKcal * servings;
    if (!isSimilar(kcal, meal.budgetKcal)) continue;

    const score = swapScore({
      kcal,
      budgetKcal: meal.budgetKcal,
      protein: proteinOf(candidate, meal.budgetKcal),
      outgoingProtein,
      proteinTargetGrams,
    });

    if (!best || score < best.score) best = { dish: candidate, servings, score };
  }

  return best ? { dish: best.dish, servings: best.servings } : null;
}

/** Protein a dish carries once portioned to a budget. */
function proteinOf(dish: CatalogDish, budgetKcal: number): number {
  const servings =
    chooseServings(dish.recipe, budgetKcal, { wholeOnly: isFixedPortion(dish.source) }) ??
    bestServings(dish.baseKcal, budgetKcal) ??
    1;

  return dish.recipe.reduce(
    (sum, line) => sum + (line.food.protein * portionLine(line, servings).quantityGrams) / 100,
    0,
  );
}

/**
 * How bad a swap is, lower being better.
 *
 * Calorie distance was the whole score, and it is why the repair could trade a
 * 143 g plate of tuna and egg for a 15 g bowl of fattoush and call it clean: both
 * land near 820 kcal, and nothing in the ranking knew the difference.
 *
 * Protein lost is added to it, weighted so that a gram of protein is worth about
 * as much as the calories it carries. That is not a precise exchange rate and does
 * not need to be — it only has to be large enough that "keeps the protein" beats
 * "two kilocalories closer", which four times the protein's own energy achieves
 * comfortably.
 *
 * Only *losses* are penalised. A replacement carrying more protein than the meal
 * it replaces is not thereby better — it may be a fish plate where a salad
 * belonged — so the score treats a gain as neutral and lets calorie distance
 * decide.
 */
function swapScore({
  kcal,
  budgetKcal,
  protein,
  outgoingProtein,
  proteinTargetGrams,
}: {
  kcal: number;
  budgetKcal: number;
  protein: number;
  outgoingProtein: number;
  proteinTargetGrams: number | null;
}): number {
  const energyGap = Math.abs(kcal - budgetKcal);

  if (proteinTargetGrams === null) return energyGap;

  const lost = Math.max(0, outgoingProtein - protein);

  return energyGap + lost * 16;
}

/**
 * What a finished week is made of, for the audit row and for tests.
 *
 * Not used by the repair — it is the same counting done once more for reporting,
 * which is cheap and keeps the repair loop readable.
 */
export function varietyProfile(
  meals: readonly VarietyMeal[],
  catalog: readonly CatalogDish[],
): { proteinSources: Record<string, number>; carbBases: Record<string, number> } {
  const byId = new Map(catalog.map((dish) => [dish.id, dish]));
  const proteinSources: Record<string, number> = {};
  const carbBases: Record<string, number> = {};

  for (const meal of meals) {
    const dish = meal.dishId ? byId.get(meal.dishId) : undefined;
    if (!dish) continue;

    const protein = proteinSource(dish.recipe);
    const carb = carbBase(dish.recipe);

    proteinSources[protein] = (proteinSources[protein] ?? 0) + 1;
    carbBases[carb] = (carbBases[carb] ?? 0) + 1;
  }

  return { proteinSources, carbBases };
}
