import {
  CLINICAL_CONDITIONS,
  DIET_PATTERNS,
  type ClinicalCondition,
  type DietPattern,
} from '@/features/clients/nutrition';

/**
 * What a client's clinical conditions mean for the week being planned.
 *
 * The vocabulary itself is in `src/features/clients/nutrition.ts` — the list a
 * dietitian ticks. This is the planner's reading of it: the constraint each
 * condition puts on the model, the energy a pregnancy or a lactation adds to the
 * target, and the cases where the honest answer is that this catalogue cannot do
 * what was asked.
 *
 * ## Everything here is a constraint on *choosing*, never a claim about safety
 *
 * A generated week is a draft a dietitian reads before it reaches anybody. These
 * rules make the draft better — a kidney patient's week that is not built on
 * three plates of red meat is a week she has to rewrite less of — and none of
 * them is a substitute for her reading it. That is why nothing here silently
 * removes a dish: the conditions travel to the model as stated constraints, and
 * the ones this catalogue genuinely cannot satisfy are reported to *her*
 * (`plannerCaveats`) rather than quietly approximated.
 *
 * ## Why the rules are written in English
 *
 * They are prompt text, and the rest of the system prompt is English — see
 * `prompt.ts`. What the *client* reads is Arabic and comes from the dish
 * catalogue; nothing here is ever shown to a patient.
 */

/**
 * What each condition tells the model, in one sentence it can act on.
 *
 * `satisfies Record<ClinicalCondition, string>` is load-bearing: adding a
 * condition to the vocabulary without deciding what it means for a plan is a
 * compile error, not a tick box that quietly changes nothing.
 *
 * Each is a *planning* constraint rather than a summary of the condition. "Renal
 * impairment" tells the model nothing; "keep to one modest portion of animal
 * protein a day and avoid very salty dishes" changes what it picks.
 */
export const CONDITION_RULES = {
  pregnancy_first_trimester:
    'Pregnant, first trimester. No liver or liver products, no raw or undercooked egg, meat or fish, no unpasteurised soft cheese. Energy needs are unchanged from before pregnancy; small frequent meals suit nausea better than large ones.',
  pregnancy_second_trimester:
    'Pregnant, second trimester. No liver or liver products, no raw or undercooked egg, meat or fish, no unpasteurised soft cheese. The calorie target already includes the extra energy for this trimester. Favour iron and calcium: dark leafy greens, legumes, dairy.',
  pregnancy_third_trimester:
    'Pregnant, third trimester. No liver or liver products, no raw or undercooked egg, meat or fish, no unpasteurised soft cheese. The calorie target already includes the extra energy for this trimester. Favour iron and calcium, and keep individual meals moderate — heartburn and a crowded stomach are the usual complaints.',
  breastfeeding:
    'Breastfeeding. The calorie target already includes the extra energy. Favour fluid-rich foods, calcium and iron; do not plan a restrictive week.',
  kidney_disease:
    'Chronic kidney disease. Keep animal protein to one modest portion a day. Avoid very salty dishes, processed and canned food, and pickles. Go easy on the highest-potassium and highest-phosphorus foods — potato, tomato paste, dried fruit, nuts, dairy in quantity, cola.',
  dialysis:
    'On dialysis. Protein needs are HIGHER, not lower — plan a good portion of animal protein at lunch and dinner. Still avoid very salty and processed food, and keep potassium and phosphorus down: little potato, tomato paste, dried fruit, nuts or cola.',
  epilepsy:
    'Epilepsy. Meal timing matters: keep to the slots given and do not leave long gaps. If a ketogenic or modified-Atkins diet is prescribed it appears as the diet pattern below, and that pattern governs.',
  diabetes_type_1:
    'Type 1 diabetes. Keep the carbohydrate load steady from day to day and across the same slot — the insulin dose is matched to it, so a Tuesday lunch twice the size of Monday’s is a dosing problem. Pair every carbohydrate with protein or fat; no sweets or sugary drinks.',
  diabetes_type_2:
    'Type 2 diabetes. Favour whole grains and legumes over refined starch, keep each meal’s carbohydrate moderate and steady, pair carbohydrate with protein or fat, and plan no sweets or sugary drinks.',
  gestational_diabetes:
    'Gestational diabetes. Keep breakfast carbohydrate low — glucose tolerance is worst in the morning — spread the rest evenly across the day, and pair every carbohydrate with protein or fat. No sweets or juice. The pregnancy rules above still apply.',
  hypertension:
    'High blood pressure. Avoid salty, processed, canned and pickled food and cured meat. Favour vegetables, fruit, legumes and dairy — the DASH pattern.',
  high_cholesterol:
    'High cholesterol. Keep saturated fat down: little red meat, butter, cream or full-fat cheese. Favour fish, legumes, oats, olive oil and nuts.',
  fatty_liver:
    'Fatty liver. No sugary drinks, sweets or refined starch in quantity; keep fried food rare. Favour vegetables, legumes, fish and olive oil.',
  hypothyroidism:
    'Hypothyroidism. No specific exclusions — plan an ordinary balanced week, and do not put large amounts of raw cruciferous vegetables or soy in it.',
  pcos:
    'PCOS. Favour low-glycaemic carbohydrate — whole grains, legumes — with protein at every meal, and no sugary drinks or sweets.',
  celiac:
    'Coeliac disease. Nothing containing wheat, barley, freekeh, bulgur or ordinary bread. This is absolute, not a preference.',
  ibs:
    'Irritable bowel syndrome. Keep portions moderate, avoid very fatty and fried dishes, and go easy on onion, garlic, pulses in quantity and dairy where the catalogue allows an alternative.',
  anemia:
    'Iron-deficiency anaemia. Plan iron-rich dishes — red meat, liver is fine here, legumes, dark leafy greens — with a source of vitamin C in the same meal, and keep tea and coffee away from meals.',
  gout: 'Gout. Avoid organ meat, red meat in quantity, and sardines and anchovies. Favour dairy, vegetables and whole grains; plenty of fluid.',
} as const satisfies Record<ClinicalCondition, string>;

/** What a prescribed pattern tells the model. Same contract as the conditions. */
export const PATTERN_RULES = {
  vegetarian:
    'VEGETARIAN week. No meat, poultry, fish or shellfish. Eggs and dairy are allowed unless another restriction excludes them.',
  vegan:
    'VEGAN week. No meat, poultry, fish, shellfish, egg, dairy or other animal-derived food.',
  low_carb:
    'LOW CARBOHYDRATE week. Keep starch small at every meal: no large rice, bread, pasta or potato portions. Build meals on protein, vegetables and healthy fat.',
  keto:
    'KETOGENIC week. Carbohydrate must be minimal at every single meal — no rice, bread, pasta, potato, legumes, fruit in quantity or sweets at all. Build every meal on fat and protein: egg, meat, fish, cheese, olive oil, nuts, non-starchy vegetables. Choose the lowest-carbohydrate dish available for every slot, even where that means repeating a protein more than the variety rules would normally allow.',
  high_protein:
    'HIGH PROTEIN week. Every meal carries a real protein source, and the daily protein target is the number to hit before anything else.',
  low_sodium:
    'LOW SODIUM week. Nothing salty, cured, canned or pickled; no processed meat, no bouillon-heavy dishes. Season with lemon, herbs and spices.',
  renal:
    'RENAL week. One modest portion of animal protein a day, low salt, and keep the highest-potassium and highest-phosphorus foods out — potato, tomato paste, dried fruit, nuts, cola, and dairy in quantity.',
  low_fat:
    'LOW FAT week. No fried dishes, little added oil, no cream or full-fat cheese. Grilled, baked and boiled cooking.',
} as const satisfies Record<DietPattern, string>;

/**
 * The nutrition categories a pattern refuses, used to narrow the catalogue
 * *before* it is described to the model.
 *
 * The same discipline as the allergen filter: a dish that is out is absent from
 * the payload, so no instruction has to be obeyed for the rule to hold. It is
 * deliberately coarse — `nutritionCategory` is computed from the recipe and is
 * the only macro label a dish has — and coarse is the right amount of filtering
 * here, because narrowing too far leaves a slot with nothing in it, which is a
 * generation failure rather than a careful plan.
 *
 * **A pattern with no entry filters nothing** and works through the prompt
 * alone. That is not a gap: "low sodium" is not a macro question, and there is
 * no computed label for salt to filter on. Inventing one would be a rule that
 * looks enforced and is not.
 */
export const PATTERN_EXCLUDES_NUTRITION: Partial<Record<DietPattern, readonly string[]>> = {
  keto: ['high_carb'],
  low_carb: ['high_carb'],
};

/**
 * The most carbohydrate a dish may carry, in grams per serving, for a pattern
 * that is about carbohydrate.
 *
 * ## Why grams and not the label
 *
 * The filter above asks `nutritionCategory`, which calls a dish `high_carb` only
 * when carbohydrate exceeds 55% of its *energy*. That is a question about
 * proportion, and keto is a question about amount.
 *
 * A fattoush is bread salad under a great deal of olive oil, so fat wins the
 * energy share and the dish is labelled `high_fat` — and sailed through a
 * ketogenic filter carrying forty grams of carbohydrate. So did a cheese manaqish,
 * and so did ice cream. The audited ketogenic week for a client with epilepsy
 * finished at 284 g of carbohydrate on the Thursday, which is not a therapeutic
 * diet and is not even a low-carbohydrate one.
 *
 * Ten grams a meal is the working figure for a ketogenic slot and twenty-five for
 * a low-carbohydrate one. Neither reaches a 4:1 therapeutic ratio — nothing in
 * this catalogue does, and `ketoNotTherapeutic` says so — but both keep bread and
 * ice cream out of a week that claims to be low in carbohydrate.
 */
export const PATTERN_MAX_CARBS_GRAMS: Partial<Record<DietPattern, number>> = {
  keto: 10,
  low_carb: 25,
};

/**
 * Extra daily energy a pregnancy or a lactation adds, in kilocalories.
 *
 * The DRI increments, and they are increments on the client's *own* estimated
 * requirement rather than a replacement for it: a pregnant woman's target is
 * still Mifflin-St Jeor over her weight, height, age and activity, plus this.
 *
 * First trimester is deliberately zero. The requirement genuinely does not rise
 * until the second — the usual clinical figure — and a plan that quietly added
 * 340 kcal from the first missed period would be adding a snack a day to
 * somebody who did not need one.
 *
 * `suggestTargets` applies it and names it, so the Nutrition tab can say where
 * the number came from. A dietitian who disagrees sets `daily_kcal_target` by
 * hand, as she can for every other client — this moves a *suggestion*, and the
 * override still wins.
 */
export const LIFE_STAGE_KCAL: Partial<Record<ClinicalCondition, number>> = {
  pregnancy_first_trimester: 0,
  pregnancy_second_trimester: 340,
  pregnancy_third_trimester: 450,
  breastfeeding: 400,
};

/**
 * The energy those conditions add, and which one added it.
 *
 * The largest single increment rather than a sum: a record that carries both
 * "third trimester" and "breastfeeding" is a record mid-correction, not a woman
 * who needs 850 extra kilocalories, and adding them would turn a data-entry slip
 * into a target nobody would notice was wrong.
 */
export function lifeStageKcal(tags: readonly string[]): {
  kcal: number;
  from: ClinicalCondition | null;
} {
  let best: { kcal: number; from: ClinicalCondition | null } = { kcal: 0, from: null };

  for (const tag of tags) {
    const kcal = LIFE_STAGE_KCAL[tag as ClinicalCondition];

    if (kcal !== undefined && kcal > best.kcal) best = { kcal, from: tag as ClinicalCondition };
  }

  return best;
}

/** Whether a string names a condition this app has a rule for. */
export function isClinicalCondition(value: unknown): value is ClinicalCondition {
  return CLINICAL_CONDITIONS.includes(value as ClinicalCondition);
}

/** Whether a string names a diet pattern this app has a rule for. */
export function isDietPattern(value: unknown): value is DietPattern {
  return DIET_PATTERNS.includes(value as DietPattern);
}

/**
 * What the dietitian has to be told before she trusts this week.
 *
 * Returned as keys rather than sentences, so the screen translates them — and
 * so a caveat is a thing the code has a name for rather than a string somebody
 * matched on.
 *
 * ## Why this exists at all
 *
 * The clinic asked how a ketogenic week would work for a client with epilepsy,
 * and the honest answer is: **not from this catalogue**. A therapeutic
 * ketogenic diet is a 3:1 or 4:1 fat-to-everything-else ratio, weighed to the
 * gram, and the catalogue is Palestinian home cooking whose lowest-carbohydrate
 * dishes are nowhere near it. The model will produce the best low-carbohydrate
 * week it can, and it will not be ketogenic.
 *
 * Saying so is the feature. A planner that took `keto`, generated a week of
 * grilled chicken and salad and presented it with no comment would be telling a
 * dietitian that a therapeutic diet had been produced, which is the one thing it
 * must not do. The caveat rides with the plan, on the screen where she reviews
 * it.
 */
export type PlannerCaveat =
  /** A therapeutic ketogenic ratio is not something this catalogue can reach. */
  | 'ketoNotTherapeutic'
  /** Renal potassium and phosphorus are not in the catalogue's own data. */
  | 'renalNutrientsUnknown'
  /** Two life-stage conditions at once — one of them is probably stale. */
  | 'conflictingLifeStage';

export function plannerCaveats(
  tags: readonly string[],
  pattern: string | null,
): PlannerCaveat[] {
  const caveats: PlannerCaveat[] = [];

  if (pattern === 'keto') caveats.push('ketoNotTherapeutic');

  /*
    The catalogue carries potassium and phosphorus for a food only where the
    source published them, and no dish-level total is computed from either. So a
    renal week is planned from the prompt's own words — "keep the highest ones
    out" — and not from a figure anything can check. She should know that.
  */
  if (pattern === 'renal' || tags.includes('kidney_disease') || tags.includes('dialysis')) {
    caveats.push('renalNutrientsUnknown');
  }

  const lifeStage = tags.filter((tag) => LIFE_STAGE_KCAL[tag as ClinicalCondition] !== undefined);

  if (lifeStage.length > 1) caveats.push('conflictingLifeStage');

  return caveats;
}

/**
 * Every clinical line the prompt should carry, in the order a clinician would
 * read them: the pattern first, because it governs the whole week, then the
 * conditions.
 *
 * Unknown tags are dropped rather than passed through. A row hand-edited into
 * holding `"سكري"` would otherwise put an untranslated, unconstrained word into
 * a list the model reads as instructions.
 */
export function clinicalRules(
  tags: readonly string[],
  pattern: string | null,
): { pattern: string | null; conditions: string[] } {
  return {
    pattern: isDietPattern(pattern) ? PATTERN_RULES[pattern] : null,
    conditions: tags.filter(isClinicalCondition).map((tag) => CONDITION_RULES[tag]),
  };
}

/**
 * The catalogue a prescribed pattern leaves, meal type by meal type.
 *
 * Filtered rather than merely instructed, following the allergen rule in
 * `prompt.ts`: a dish that is out is absent from the payload, so no instruction
 * has to be obeyed for it to stay out. What it filters on is
 * `nutritionCategory`, computed from the recipe — see `PATTERN_EXCLUDES_NUTRITION`
 * for why that is the only macro label a dish has and why coarse is right here.
 *
 * This function is intentionally strict. If the remaining catalogue cannot fill
 * a slot, generation stops and names the gap; it must never restore dishes that
 * violate a prescription merely to keep the model running.
 */
export function narrowToPattern<
  T extends { mealTypes: readonly string[]; nutritionCategory: string; baseCarbs: number },
>(catalog: readonly T[], pattern: string | null): T[] {
  const excluded = isDietPattern(pattern) ? PATTERN_EXCLUDES_NUTRITION[pattern] : undefined;
  const maxCarbs = isDietPattern(pattern) ? PATTERN_MAX_CARBS_GRAMS[pattern] : undefined;

  if (!excluded?.length && maxCarbs === undefined) return [...catalog];

  const banned = new Set(excluded ?? []);

  /* The label and the gram count both have to pass — see PATTERN_MAX_CARBS_GRAMS
     for the fattoush that passed the first and should never have passed the
     second. */
  return catalog.filter(
    (dish) =>
      !banned.has(dish.nutritionCategory) &&
      (maxCarbs === undefined || dish.baseCarbs <= maxCarbs),
  );
}
