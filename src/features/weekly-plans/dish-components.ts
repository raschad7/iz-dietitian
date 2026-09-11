/**
 * What a client can actually portion separately on the plate.
 *
 * ## The flag this replaces
 *
 * `dish_ingredients.is_primary` used to mean "important enough to adjust", one
 * line at a time, at most three per dish. On an assembled plate that is right:
 * the chicken and the rice arrive in separate spoonfuls and move independently.
 * On a cooked mixed dish it is a lie. مجدرة was marked with an adjustable rice
 * line and an adjustable lentil line, so the board offered to raise the rice and
 * leave the lentils — an instruction nobody can follow, because the rice and the
 * lentils were boiled in the same pot.
 *
 * A **component** is the unit the client is actually served: a thing they can
 * take more or less of without taking the dish apart. A component may be one
 * recipe line (the chicken) or several that were cooked together (the rice, the
 * lentils, the onion and the oil that became مجدرة). What makes it a component
 * is that it is *served* as one thing, not that it is nutritionally important.
 *
 * ## Two behaviours, one control
 *
 * - **A single-line component** keeps everything it had: its own unit, its own
 *   step, its own ceiling. `portionLine` decides it, exactly as before.
 * - **A grouped component** moves as one. Its lines scale together by the same
 *   ratio, so the recipe's proportions survive every adjustment — which is the
 *   whole point, since changing the lentil-to-rice ratio is a *recipe* edit and
 *   this control is a *serving* adjustment.
 *
 * ## Inside a group, lines are grams
 *
 * A grouped line drops its portion count. Not an oversight — «٦ ملاعق أرز» is a
 * true statement about the pot and a false instruction about the plate, because
 * the client is not served rice, they are served مجدرة. The grams stay visible so
 * the dietitian can still inspect what is in it, which is the part she needs.
 *
 * @see docs/audits/2026-09-09-weekly-plan-remediation-plan.md — Milestone 3
 */

import { clean } from './portioning';

/**
 * How far one press moves a grouped component, as a share of its recipe amount.
 *
 * A tenth. A dietitian adjusting a cooked plate is thinking "a bit more" and "a
 * bit less", not in the units of any one thing inside it, and a tenth of the
 * serving is what that phrase means. Being proportional is what keeps it sane
 * across sizes: a 150 g bowl moves by 15 g and a 600 g platter by 60.
 *
 * A single-line component never uses this — it has a real unit, and half a loaf
 * or one spoon is a better step than any percentage.
 */
export const COMPONENT_STEP_SHARE = 0.1;

/** The smallest useful step for a grouped component, in grams. */
export const MIN_COMPONENT_STEP = 10;

/**
 * How many controls the meal panel shows before folding the rest away.
 *
 * A display decision, not a rule about dishes. The seed used to cap a recipe at
 * three adjustable lines so the panel would stay readable, which made a
 * presentation problem into a constraint on what a dish was allowed to be — a
 * mixed grill with four separately served parts had to pretend it had three.
 * The panel handles it now, and a dish may have as many parts as it has.
 */
export const VISIBLE_CONTROLS = 3;

/**
 * The step for a grouped component, in grams, from what the recipe holds.
 *
 * Rounded to 5 g so the amounts a dietitian reads stay round. Derived rather
 * than stored: a step is a consequence of the serving's size, and storing it
 * would be one more number to keep true as recipes change.
 */
export function componentStep(baseGrams: number): number {
  const raw = baseGrams * COMPONENT_STEP_SHARE;
  return Math.max(MIN_COMPONENT_STEP, Math.round(raw / 5) * 5);
}

/** The fields a line needs to be placed in a component. */
export type ComponentLine = {
  /**
   * The component this line belongs to, or null when the line is its own.
   *
   * Null is the ordinary case and the one every existing recipe is in: a line
   * nobody grouped stands alone, adjustable or not, exactly as it always did.
   */
  componentKey?: string | null;
  /** The served thing's name, carried on every line of the group. */
  componentNameAr?: string | null;
  componentNameEn?: string | null;
  /** Whether this component carries a `−/+`. Agrees across a group. */
  isPrimary: boolean;
  quantityGrams: number;
  sortOrder: number;
  food: { id: string; nameAr: string; nameEn: string };
};

/** A served thing, and the recipe lines that make it. */
export type DishComponent<L extends ComponentLine> = {
  /** Stable within the dish: the component's own key, or `food:<id>` for a solo line. */
  key: string;
  nameAr: string;
  nameEn: string;
  /** Whether a dietitian moves this component by hand. */
  adjustable: boolean;
  /** True when several lines move together and the lines are shown in grams. */
  grouped: boolean;
  lines: L[];
  /** What the component holds right now, summed from its lines. */
  totalGrams: number;
};

/** The key a line groups under. A solo line groups under its own food. */
function keyOf(line: ComponentLine): string {
  return line.componentKey ?? `food:${line.food.id}`;
}

/**
 * The dish's lines as the things a client is served.
 *
 * Order follows `sortOrder`: a component appears where its first line does, so
 * the plate reads in the order the recipe was written. Lines of one component
 * are not required to be adjacent in the recipe, though an author who scatters
 * them will find the component sitting at the first of them.
 */
export function groupComponents<L extends ComponentLine>(
  lines: readonly L[],
): DishComponent<L>[] {
  const byKey = new Map<string, DishComponent<L>>();

  for (const line of [...lines].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const key = keyOf(line);
    const found = byKey.get(key);

    if (found) {
      found.lines.push(line);
      found.totalGrams = clean(found.totalGrams + line.quantityGrams);
      // Several lines under one key is what makes it a group; a component block
      // naming one line is still that line, with a name of its own.
      found.grouped = true;
      continue;
    }

    byKey.set(key, {
      key,
      // A grouped line carries the served thing's name. A solo line is its food,
      // which is what the panel has always shown and needs no second copy.
      nameAr: line.componentNameAr ?? line.food.nameAr,
      nameEn: line.componentNameEn ?? line.food.nameEn,
      adjustable: line.isPrimary,
      grouped: false,
      lines: [line],
      totalGrams: line.quantityGrams,
    });
  }

  return [...byKey.values()];
}

/** One row of a meal as a person reads it: a name, and a line carrying the amount. */
export type ReadableRow<L> = {
  key: string;
  nameAr: string;
  nameEn: string;
  /**
   * The line to read the amount from.
   *
   * For a group this is a stand-in holding the weight of all of it and no
   * count — the client is served مجدرة, not six spoons of rice — so every
   * surface can keep spelling a quantity the one way `ingredientAmount` does.
   */
  line: L;
};

/**
 * A meal's lines as the things it is served as, ready to print or list.
 *
 * The single collapse, used by the panel, the client's card and the printed
 * plan, so the three cannot describe one meal three ways. Sides arrive already
 * ungrouped from `sideLines`, so they pass through as themselves.
 */
export function readableRows<
  L extends ComponentLine & { portion?: unknown; portionQuantity?: number | null },
>(lines: readonly L[]): ReadableRow<L>[] {
  return groupComponents(lines).map((component) => {
    const first = component.lines[0]!;

    return {
      key: component.key,
      nameAr: component.nameAr,
      nameEn: component.nameEn,
      line: component.grouped
        ? ({
            ...first,
            quantityGrams: component.totalGrams,
            portion: null,
            portionQuantity: null,
          } as L)
        : first,
    };
  });
}

/** Just the components a dietitian can move. */
export function adjustableComponents<L extends ComponentLine>(
  components: readonly DishComponent<L>[],
): DishComponent<L>[] {
  return components.filter((component) => component.adjustable);
}

/**
 * What every line of a grouped component becomes at a new total.
 *
 * One ratio, applied to all of them, so the proportions the recipe was written
 * with survive. The count goes to null on every line: inside a group the amounts
 * are grams, because the group is what carries a unit.
 *
 * Returns absolute amounts, matching everything else the meal layer produces.
 */
export function scaleComponentLines<L extends ComponentLine>(
  component: DishComponent<L>,
  totalGrams: number,
): { foodId: string; quantityGrams: number; portionId: null; portionQuantity: null }[] {
  const ratio = component.totalGrams > 0 ? totalGrams / component.totalGrams : 1;

  return component.lines.map((line) => ({
    foodId: line.food.id,
    quantityGrams: clean(line.quantityGrams * ratio),
    portionId: null,
    portionQuantity: null,
  }));
}

/**
 * The total a grouped component lands on after one press.
 *
 * `baseGrams` is what the recipe holds, and is the origin of the grid — the same
 * rule `stepFromBase` follows for a line, so an adjusted component can always be
 * walked back to exactly the recipe amount. Never below one step: a component at
 * zero has been removed from the meal, and removing one is a different decision
 * from making it smaller.
 */
export function nextComponentTotal(
  current: number,
  baseGrams: number,
  direction: 1 | -1,
): number {
  const step = componentStep(baseGrams);
  const steps = Math.round((current - baseGrams) / step) + direction;
  const moved = clean(baseGrams + steps * step);

  return Math.max(Math.min(baseGrams, step), moved);
}

// ---------------------------------------------------------------------------
// Authoring rules
// ---------------------------------------------------------------------------

/**
 * What makes a set of component declarations usable, checked once at write time.
 *
 * Names and adjustability are stored on every line of a group rather than in a
 * table of their own, which is cheap to read everywhere and would let two lines
 * of one component disagree. These are the checks that stop that, and they run
 * in the seed, in the clinic dish editor's schema and in the dataset build — the
 * three places a recipe can be written.
 *
 * Returns human-readable problems, empty when the lines are sound.
 */
export function componentProblems(lines: readonly ComponentLine[]): string[] {
  const problems: string[] = [];
  const groups = new Map<string, ComponentLine[]>();

  for (const line of lines) {
    if (!line.componentKey) {
      // A name without a key names nothing: it would be dropped on read, and a
      // silently dropped name is how an author comes to believe they grouped
      // something they did not.
      if (line.componentNameAr || line.componentNameEn) {
        problems.push(
          `${line.food.nameEn}: has a component name but no component key`,
        );
      }
      continue;
    }

    const bucket = groups.get(line.componentKey);
    if (bucket) bucket.push(line);
    else groups.set(line.componentKey, [line]);
  }

  for (const [key, group] of groups) {
    const [first] = group;
    if (!first) continue;

    if (!first.componentNameAr?.trim() || !first.componentNameEn?.trim()) {
      // The name is the instruction — "صحن مجدرة" is what the client is told to
      // serve — so a group without one has no way to describe itself.
      problems.push(`component "${key}": needs an Arabic and an English name`);
    }

    if (group.some((line) => line.componentNameAr !== first.componentNameAr)) {
      problems.push(`component "${key}": its lines disagree on the Arabic name`);
    }

    if (group.some((line) => line.componentNameEn !== first.componentNameEn)) {
      problems.push(`component "${key}": its lines disagree on the English name`);
    }

    if (group.some((line) => line.isPrimary !== first.isPrimary)) {
      // Half a component cannot be adjustable: the control moves every line it
      // holds, so the lines have to agree on whether there is a control at all.
      problems.push(`component "${key}": some lines are adjustable and some are not`);
    }
  }

  return problems;
}
