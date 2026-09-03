import type { IconName } from '@/components/ui/icon';

/**
 * What *kind* of thing is standing beside the meal — a salad, a cup of soup, a
 * plate of labneh.
 *
 * ## Why this exists at all
 *
 * The meal card had the sides as a second line of text under the dish name:
 * `+ صحن سلطة`. Correct, and it spends the card's one remaining line on the
 * quieter half of the sentence — thirty-five cards deep, that line is what the
 * eye has to read past to get to the next dish name. A glyph in the corner says
 * *there is a salad here* without asking to be read, and the name it stands for
 * is still on the chip's tooltip, in the meal panel, on the printout and in the
 * client's own list.
 *
 * A picture only works if it is the right picture, which is what this file is:
 * six kinds, six glyphs, six colours, decided in one place so the salad on
 * Sunday and the salad on Thursday are the same green leaf.
 *
 * ## Why it is read off the name
 *
 * There is no column for it, and there should not be one. `is_side` is the only
 * thing the database needs to know — everything downstream treats a side as a
 * whole dish standing at one serving, and that is what keeps the write simple.
 * Adding `side_kind` would be a second fact a clinic could type wrong about a
 * dish whose name already says it, and a wrong colour is worse than a neutral
 * one.
 *
 * So this is deliberately a **display** decision, taken from the display name,
 * with a neutral answer for anything it does not recognise. The board's colours
 * mean protein source (see `meal-tag-tone.ts`) and that fact is computed from
 * the recipe because a plan is read for it; this one is a wayfinding mark on a
 * corner chip, and the cost of it being wrong is a fork instead of a leaf.
 *
 * ## The seventeen it has to get right
 *
 * Every side in the shipped catalog, and the kind each lands on:
 *
 * | Kind | Sides |
 * |---|---|
 * | `soup` | كوب شوربة عدس، شوربة خضار، كوب شوربة فريكة، كوب شوربة دجاج بالشعيرية، كوب شوربة خضروات كريمية |
 * | `salad` | صحن سلطة، سلطة عربية، سلطة ملفوف، سلطة بندورة وبصل، سلطة خيار باللبن، تبولة |
 * | `dairy` | صحن لبنة، كوب لبن |
 * | `pickles` | مخلل وزيتون |
 * | `vegetables` | خس وفجل، شرائح خضار، بطاطا حرة |
 *
 * **The order the tests run in is load-bearing.** سلطة خيار باللبن holds both
 * "سلطة" and "لبن"; it is a salad, so salad is asked before dairy. شوربة is
 * asked first of all, because a soup made of anything is still a soup.
 */
export const SIDE_KINDS = ['salad', 'soup', 'dairy', 'pickles', 'vegetables', 'other'] as const;

export type SideKind = (typeof SIDE_KINDS)[number];

/** A side's two names, which is all a board row carries of it. */
type NamedSide = { nameAr: string; nameEn: string };

/**
 * The words that decide, in the order they are asked.
 *
 * Both scripts, because a clinic writing its own side may fill in only one of
 * the two names and the plan may be read in either language. Matching is a plain
 * substring test on the lowercased name: Arabic has no case, and the English
 * half is a controlled vocabulary of about forty words.
 */
const KIND_WORDS: readonly (readonly [SideKind, readonly string[]])[] = [
  ['soup', ['شوربة', 'شوربه', 'حساء', 'soup', 'broth']],
  ['salad', ['سلطة', 'سلطه', 'تبولة', 'تبوله', 'فتوش', 'salad', 'tabbouleh', 'tabouleh', 'fattoush']],
  ['dairy', ['لبن', 'لبنة', 'لبنه', 'زبادي', 'yogurt', 'yoghurt', 'labneh', 'labaneh']],
  ['pickles', ['مخلل', 'مخللات', 'زيتون', 'pickle', 'olive']],
  [
    'vegetables',
    [
      'خضار',
      'خضروات',
      'خس',
      'فجل',
      'خيار',
      'بندورة',
      'جزر',
      'بطاطا',
      'vegetable',
      'veggie',
      'lettuce',
      'radish',
      'cucumber',
      'tomato',
      'carrot',
      'potato',
    ],
  ],
];

/**
 * Which kind a side is.
 *
 * Falls to `other` rather than guessing — a fork on a neutral chip is an honest
 * "something else is on this plate", and that is a better failure than painting
 * a plate of pasta green because it has a leaf in its name.
 */
export function sideKind(side: NamedSide): SideKind {
  const haystack = `${side.nameAr} ${side.nameEn}`.toLowerCase();

  for (const [kind, words] of KIND_WORDS) {
    if (words.some((word) => haystack.includes(word))) return kind;
  }

  return 'other';
}

/** The glyph for a kind. See the registry in `src/lib/icons.ts`. */
export const SIDE_KIND_ICON: Record<SideKind, IconName> = {
  salad: 'sideSalad',
  soup: 'sideSoup',
  dairy: 'sideDairy',
  pickles: 'sidePickles',
  vegetables: 'sideVegetables',
  other: 'sideOther',
};

/**
 * The chip's colour, as the pair of classes that draw it.
 *
 * One token per kind, with the fill taken from it at 15% so a chip can never
 * carry a hue its glyph does not — see `--planner-side-*` in `globals.css`. The
 * six stops are the ones the protein palette already uses, which keeps the
 * planner to one set of hues even though the two scales mean different things:
 * a rule across the top of a card is what the meal is made of, a chip in its
 * corner is what is standing next to it.
 */
export const SIDE_KIND_CLASS: Record<SideKind, string> = {
  salad: 'bg-planner-side-salad/15 text-planner-side-salad',
  soup: 'bg-planner-side-soup/15 text-planner-side-soup',
  dairy: 'bg-planner-side-dairy/15 text-planner-side-dairy',
  pickles: 'bg-planner-side-pickles/15 text-planner-side-pickles',
  vegetables: 'bg-planner-side-vegetables/15 text-planner-side-vegetables',
  other: 'bg-planner-side-other/15 text-planner-side-other',
};

/** Both halves at once, for the one shape every surface draws a side as. */
export function sideChipStyle(side: NamedSide): { icon: IconName; className: string } {
  const kind = sideKind(side);
  return { icon: SIDE_KIND_ICON[kind], className: SIDE_KIND_CLASS[kind] };
}
