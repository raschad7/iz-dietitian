/**
 * What a portion **is**, as opposed to what it is called.
 *
 * A `catalog_food_portions` row used to carry a bilingual label and a weight and
 * nothing else, and that was not enough to tell two different objects apart. The
 * catalog ships twenty-two portions labelled `ملعقة كبيرة`: twenty-one are USDA's
 * *level measuring tablespoon* and one — rice, written by a dietitian — is the
 * *heaped eating spoon* she actually means. They differ by a factor of three, and
 * nothing in the data said so, which is why a plan could resolve «٦ ملاعق برغل»
 * to 50 g and build a week's energy on it without anything looking wrong.
 *
 * Both objects are legitimate. A spoon of olive oil really is levelled; a spoon of
 * rice really is heaped. The defect was never the weights, it was that identity
 * lived in a prose label.
 *
 * So identity moves here, into a closed vocabulary of keys, and everything a
 * portion does — how it is worded to a client, what one press of `−`/`+` moves it
 * by, whether a weight is plausible — is decided from that key rather than from
 * the label beside it. A label becomes text a human reads, and renaming one stops
 * being a behaviour change.
 *
 * ## Grams are still the only nutrition path
 *
 * Unchanged, and worth restating because this module is about servings: every
 * total is built from `dish_ingredients.quantity_grams`, written at save time.
 * Nothing here is an input to `dishTotals`. Correcting a portion's weight cannot
 * move a recipe that already exists — it changes what a *new* entry resolves to,
 * and how a saved weight is worded when reopened.
 *
 * @see docs/audits/2026-09-10-portion-contract.md
 */

/**
 * How a portion is physically measured.
 *
 * The fact the catalog could not previously state. It is what makes a client
 * instruction unambiguous — `٦ ملاعق أرز ممتلئة` and `ملعقة زيت ممسوحة` are
 * different sentences — and what makes a weight checkable: a `heaped_spoon` at
 * 8.4 g is a contradiction, and 8.4 g is what `برغل مطبوخ` ships today.
 */
export const PORTION_MEASURES = [
  /** An eating spoon, filled. ملعقة أكل ممتلئة. Rice, bulgur, labaneh, cooked legumes. */
  'heaped_spoon',
  /** A measuring spoon, levelled. ملعقة ممسوحة. Oil, tahini, honey, spices. */
  'level_spoon',
  /** A standard cup, levelled. */
  'cup',
  /** One whole flatbread of a stated size. */
  'loaf',
  /** One countable item of a stated size — an egg, an apple. */
  'piece',
  /** One cut off something bigger — a wedge of watermelon, a slice of toast. */
  'slice',
  /** One packed unit as sold — a tin of chickpeas, a pot of yogurt. */
  'container',
  /** A single leaf. Mint, and nothing else so far. */
  'leaf',
  /** A reviewed serving of a finished dish — a ladle of soup, a plate of mujaddara. */
  'serving',
] as const;

export type PortionMeasure = (typeof PORTION_MEASURES)[number];

/**
 * The step one press of `−`/`+` moves a unit by, and the reason it is a property
 * of the unit rather than of the food.
 *
 * Bread moves by half a loaf because half a loaf is a real instruction; an egg
 * moves by a whole egg because half an egg is not. That is true of every bread and
 * every egg, so it belongs to the key. A food that genuinely needs its own grid
 * overrides it in `portionRules`.
 *
 * A key whose label already names a fraction (`نصف كوب`) steps by whole ones: a
 * quarter of a half cup is arithmetic nobody serves.
 */
type KeySpec = {
  measure: PortionMeasure;
  /** Default step in this unit. */
  step: number;
};

/**
 * Every portion identity the catalog may use.
 *
 * Closed on purpose. The derived rows come from `FAMILY_ROWS` in
 * `portion-derivation.ts`, which already produces exactly this set, so a key is a
 * column beside a label that existed rather than a new decision per food. A
 * curated row may only claim one of these too — an open vocabulary would put us
 * back where we started, with identity as free text.
 */
export const PORTION_KEY_SPECS = {
  cup: { measure: 'cup', step: 0.25 },
  'half-cup': { measure: 'cup', step: 1 },
  'quarter-cup': { measure: 'cup', step: 1 },

  /**
   * USDA's tablespoon: 15 ml, levelled.
   *
   * Named for what it *is*, so that a heaped eating spoon can sit on the same
   * food without the two being one row. Under the old label-as-identity they
   * could not: rice's 25 g heaped spoon and twenty-one 2.7–21 g level spoons all
   * read `ملعقة كبيرة` / `Tablespoon`, and only a sentence in `source_ref` said
   * which was which.
   */
  'level-tablespoon': { measure: 'level_spoon', step: 1 },
  teaspoon: { measure: 'level_spoon', step: 1 },

  /** The dietitian's ملعقة. Always curated — USDA does not publish this object. */
  'heaped-spoon': { measure: 'heaped_spoon', step: 1 },

  loaf: { measure: 'loaf', step: 0.5 },
  'half-loaf': { measure: 'loaf', step: 1 },

  /** A slice is already a cut off something bigger, so cutting it again is ordinary. */
  slice: { measure: 'slice', step: 0.5 },
  piece: { measure: 'piece', step: 1 },
  container: { measure: 'container', step: 0.5 },
  leaf: { measure: 'leaf', step: 1 },
  serving: { measure: 'serving', step: 0.5 },
} as const satisfies Record<string, KeySpec>;

export type PortionKey = keyof typeof PORTION_KEY_SPECS;

export const PORTION_KEYS = Object.keys(PORTION_KEY_SPECS) as PortionKey[];

export function isPortionKey(value: string): value is PortionKey {
  return Object.hasOwn(PORTION_KEY_SPECS, value);
}

/** How a portion is measured, from its identity alone. */
export function measureOf(key: PortionKey): PortionMeasure {
  return PORTION_KEY_SPECS[key].measure;
}

/** The default step for a portion identity, before any per-food override. */
export function defaultStepOf(key: PortionKey): number {
  return PORTION_KEY_SPECS[key].step;
}

/**
 * Where a portion's weight came from.
 *
 * `usda_measure` is the honest label for the twenty-one level spoons already
 * shipping. They are real measurements of a real object — just not the object a
 * dietitian means. Saying so is what lets them keep working while being visibly
 * unreviewed, instead of being deleted or silently trusted.
 */
export const EVIDENCE_KINDS = [
  'local_measurement',
  'published_table',
  'usda_measure',
  'estimate',
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export type PortionEvidence = {
  kind: EvidenceKind;
  /** A citation, a URL, or who weighed it and where. */
  source: string;
  /** ISO date the weight was established. */
  date: string;
  /** How many servings were weighed, for a local measurement. */
  samples?: number;
  /** The spread observed across those servings. */
  rangeGrams?: readonly [number, number];
  note?: string;
};

/**
 * A portion's place in review.
 *
 * `candidate` and `needs_review` may be offered in the editor with their status
 * visible. Neither may be a food's counted unit — the unit a *generated* plan
 * writes without anyone choosing it. That is the rule that stops an unreviewed
 * number quietly looking official, and it is why classifying the existing rows
 * honestly is a change with teeth rather than a labelling exercise.
 */
export const REVIEW_STATUSES = ['candidate', 'needs_review', 'reviewed'] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export function isReviewed(status: ReviewStatus): boolean {
  return status === 'reviewed';
}

/**
 * Measures no published source can settle, so a review is the only thing that can
 * establish them.
 *
 * A cup, a medium apple and a levelled 15 ml spoon are objects USDA measured: a
 * catalog may lean on those unreviewed and say so. A *heaped* eating spoon is a
 * convention of one kitchen — there is no table to defer to — and a *serving* of a
 * finished dish depends on a recipe's yield. Unreviewed, those are not weak
 * numbers; they are numbers nobody has made yet, and a generated plan must not
 * write one.
 */
const LOCAL_ONLY_MEASURES = new Set<PortionMeasure>(['heaped_spoon', 'serving']);

/** Whether this identity can only be established by someone reviewing it. */
export function requiresReview(key: PortionKey): boolean {
  return LOCAL_ONLY_MEASURES.has(measureOf(key));
}

/** The curated facts a food may assert about one of its portions. */
export type PortionRule = {
  /** Overrides the derived weight. How a corrected loaf or a heaped spoon lands. */
  grams?: number;
  /**
   * Overrides the wording, in either language.
   *
   * Safe precisely because identity is the key: `ملعقة كبيرة` becomes
   * `ملعقة ممسوحة` on a food that also carries a heaped spoon, and nothing that
   * reads the portion notices. Under the old label-as-identity this edit would
   * have broken the step, the ceiling and every recipe line at once.
   */
  labelAr?: string;
  labelEn?: string;
  /** Overrides {@link defaultStepOf} where a food genuinely needs its own grid. */
  step?: number;
  /** The most of this food, in this unit, one meal may hold. */
  maxPerMeal?: number;
  evidence?: PortionEvidence;
  reviewStatus?: ReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
};

/** A portion as the contract needs to see it, whatever else the caller carries. */
export type ContractPortion = {
  key: PortionKey;
  grams: number;
};

/**
 * Weights that are impossible for the object the key names.
 *
 * Bounded **per key rather than per measure**, because a half cup is half a cup by
 * construction: one range applied to `cup`, `half-cup` and `quarter-cup` alike
 * called a correct 15 g half-cup of spinach an error.
 *
 * Where a unit names a volume the range is that volume across the density of food
 * — roughly 0.025 g/ml for air-puffed food and 1.5 g/ml for honey or oil-soaked
 * grain. That is a real physical bound rather than a guess, and it is wide on
 * purpose: the point is to catch a portion that is the wrong *kind* of thing, not
 * to second-guess a measured number.
 *
 * The cup's floor was 0.1 g/ml until popcorn and جرجير arrived and were refused
 * at 8 g and 20 g a cup. Both are correct: a cup of popcorn is mostly air, and a
 * cup of loose leaves barely more. The floor had been set from the lightest food
 * anyone had entered rather than from the lightest food there is, which is how a
 * plausibility check comes to reject reality. It still catches what it is for —
 * a cup recorded at a teaspoon's weight.
 *
 * Units that name an *object* are mostly left unbounded, because their spread is
 * genuinely enormous — a mint leaf is 0.15 g and a cabbage leaf 23 g, a radish
 * slice is 1 g and a watermelon wedge 286 g. A bound there would be a number
 * invented to look strict. The loaf is the exception and keeps one: bread is
 * bread. `piece` is already floored and capped inside `portion-derivation.ts`.
 *
 * The heaped spoon's floor is the row that earns its keep. It is what makes
 * `برغل مطبوخ` at 8.4 g a build failure the moment anyone claims it is heaped,
 * which is the defect this whole contract exists for.
 */
const PLAUSIBLE_GRAMS: Partial<Record<PortionKey, readonly [number, number]>> = {
  /* 240 ml. */
  cup: [6, 360],
  'half-cup': [3, 180],
  'quarter-cup': [1.5, 90],

  /* 15 ml levelled, and 5 ml for its third. */
  'level-tablespoon': [1.5, 22],
  teaspoon: [0.5, 7.5],

  /* An eating spoon filled: two to three times a levelled 15 ml spoon. */
  'heaped-spoon': [10, 60],

  loaf: [20, 200],
  'half-loaf': [10, 100],
};

/** Why a portion's weight cannot be what it claims to be, or null when it can. */
export function implausibleWeight(portion: ContractPortion): string | null {
  const bounds = PLAUSIBLE_GRAMS[portion.key];
  if (!bounds) return null;

  const [min, max] = bounds;
  const measure = measureOf(portion.key);

  if (portion.grams < min) {
    return `${portion.key} at ${portion.grams} g is below the ${min} g floor for a ${measure}`;
  }
  if (portion.grams > max) {
    return `${portion.key} at ${portion.grams} g is above the ${max} g ceiling for a ${measure}`;
  }

  return null;
}

/**
 * Every way one food's set of portions can contradict itself.
 *
 * The ordering checks are the ones that matter. A heaped spoon that does not
 * outweigh the same food's level spoon is not heaped, and a half cup that is not
 * half of that food's cup means one of the two was corrected and the other was
 * forgotten — the exact failure mode of a catalog where related weights are
 * separate rows.
 */
export function portionSetProblems(portions: readonly ContractPortion[]): string[] {
  const problems: string[] = [];
  const byKey = new Map(portions.map((portion) => [portion.key, portion]));

  const seen = new Set<PortionKey>();
  for (const portion of portions) {
    if (seen.has(portion.key)) problems.push(`duplicate portion key ${portion.key}`);
    seen.add(portion.key);

    const implausible = implausibleWeight(portion);
    if (implausible) problems.push(implausible);
  }

  const heaped = byKey.get('heaped-spoon');
  const level = byKey.get('level-tablespoon');
  if (heaped && level && heaped.grams <= level.grams) {
    problems.push(
      `heaped-spoon (${heaped.grams} g) must outweigh level-tablespoon (${level.grams} g)`,
    );
  }

  const tablespoon = byKey.get('level-tablespoon');
  const teaspoon = byKey.get('teaspoon');
  if (tablespoon && teaspoon && teaspoon.grams >= tablespoon.grams) {
    problems.push(
      `teaspoon (${teaspoon.grams} g) must be lighter than level-tablespoon (${tablespoon.grams} g)`,
    );
  }

  for (const [whole, half, name] of [
    ['cup', 'half-cup', 'half cup'],
    ['loaf', 'half-loaf', 'half loaf'],
  ] as const) {
    const full = byKey.get(whole);
    const part = byKey.get(half);
    if (!full || !part) continue;

    // A tenth of a gram of slack: the derivation rounds, so an exact halving of an
    // odd weight lands just off.
    if (Math.abs(part.grams - full.grams / 2) > 0.1) {
      problems.push(
        `${name} (${part.grams} g) is not half of ${whole} (${full.grams} g)`,
      );
    }
  }

  return problems;
}
