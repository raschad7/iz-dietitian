/**
 * Generates `src/lib/icons.generated.ts` from the Solar icon set.
 *
 * The app's icon language is **Solar Linear** — rounded, open strokes, one
 * weight everywhere.
 *
 * It was Solar Bold until now, with three documented exceptions that had grown
 * up one at a time: the portal's outer tabs, the client's meal cards, and the
 * client record's row markers had each gone linear because a filled glyph beside
 * every heading turned a page you read into a page of marks. Three exceptions to
 * a rule is the rule asking to be rewritten, and it has been: the whole app is
 * linear now, and the `*Outline` entries below survive only because a hundred
 * call sites name them — several are now the same glyph as their unsuffixed
 * twin, which is harmless and is why they are kept rather than swept.
 *
 * Linear bodies are lighter on the page than filled ones at the same box size,
 * which `Icon` compensates for by drawing the artwork slightly larger inside
 * its box. See `src/components/ui/icon.tsx`.
 *
 * Rather than pull `@iconify/react` into the client bundle (it
 * ships an API loader that fetches icons over the network at runtime), this
 * copies the handful of SVG bodies the app actually uses into a generated
 * module. The result is offline, tree-shakeable, and about 6 KB instead of the
 * ~1.2 MB the full Solar collection would cost.
 *
 * `@iconify-json/solar` is a devDependency for exactly this reason: it is a
 * build input, never a runtime one.
 *
 * To add an icon: put it in ICONS below, run `bun run icons:generate`, and use
 * it as `<Icon name="..." />`. The name union is regenerated with it, so a
 * typo is a type error rather than an empty box.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import solar from '@iconify-json/solar/icons.json' with { type: 'json' };

/**
 * Local name → Solar icon. Local names describe the *role* the icon plays in
 * this app, not the picture, so swapping the underlying glyph later is a
 * one-line change here rather than a sweep through every call site.
 */
const ICONS = {
  // Navigation — staff
  dashboard: 'widget-4-linear',
  clients: 'users-group-rounded-linear',
  calendar: 'calendar-linear',
  weeklyPlans: 'clipboard-list-linear',
  mealPlans: 'chef-hat-linear',
  dishes: 'cup-hot-linear',
  foods: 'donut-linear',
  whatsapp: 'chat-round-dots-linear',
  security: 'shield-keyhole-linear',
  // The rail's profile menu. A gear, not the person glyph `profile` uses —
  // that row is reached *from* a control already showing who you are.
  settings: 'settings-linear',

  // Client profile card headers
  contact: 'phone-linear',
  notes: 'notes-linear',

  // Navigation — client portal
  portalHome: 'home-2-linear',
  myAppointments: 'calendar-linear',
  myPlan: 'chef-hat-linear',
  progress: 'round-graph-linear',
  profile: 'user-linear',

  /**
   * The client bottom tab bar's four outer tabs.
   *
   * These were the app's first linear exception, back when everything else was
   * filled — they frame the featured centre tab and a bold outer set competed
   * with it. Now that the whole set is linear they are the same glyphs as
   * `portalHome`/`myAppointments`/`profile` above, and `progressOutline` is the
   * only one that still differs. They stay as separate names because
   * `PortalTabBar` reads them by name and because the bar may want its own
   * glyphs again; nothing breaks while they agree.
   */
  portalHomeOutline: 'home-2-linear',
  myAppointmentsOutline: 'calendar-linear',
  progressOutline: 'chart-2-linear',
  profileOutline: 'user-linear',
  /** The featured centre tab's glyph — a plan on a page. */
  myPlanFeatured: 'document-text-linear',

  // Direction — these mirror in RTL, see DIRECTIONAL in icon.tsx
  chevronDown: 'alt-arrow-down-linear',
  chevronUp: 'alt-arrow-up-linear',
  chevronStart: 'alt-arrow-left-linear',
  chevronEnd: 'alt-arrow-right-linear',
  navigationMenu: 'hamburger-menu-linear',
  signOut: 'logout-2-linear',

  // Actions
  search: 'rounded-magnifer-linear',
  add: 'add-circle-linear',
  close: 'close-circle-linear',
  trash: 'trash-bin-trash-linear',
  edit: 'pen-2-linear',
  copy: 'copy-linear',
  refresh: 'refresh-linear',
  archive: 'archive-linear',
  restore: 'restart-linear',
  filter: 'filter-linear',
  /** The "this column can be sorted" affordance, before a direction is chosen. */
  sort: 'sort-vertical-linear',

  /**
   * "There is more you can do to this thing." The calendar's appointment cards
   * carry it in their top corner, where it opens exactly what a right-click
   * opens.
   *
   * The same Solar glyph as `dragHandle` and deliberately a second entry — the
   * one is a grip and this one is a menu, and either can be redrawn without
   * dragging the other with it. Same reasoning as `navNode` / `leaf`.
   */
  moreActions: 'menu-dots-linear',

  // Weekly plan board
  /** The separate handle that starts a drag, so dragging never steals the click. */
  dragHandle: 'menu-dots-linear',
  /** Empties a slot without removing it from the day. */
  clearSlot: 'eraser-linear',
  /** A value that overshot its target. */
  driftUp: 'arrow-up-linear',
  /** A value that undershot its target. */
  driftDown: 'arrow-down-linear',
  /** A dish repeated from the plan being compared against. */
  repeat: 'restart-linear',
  /** Holding this week against an earlier one. */
  history: 'history-linear',
  minus: 'minus-circle-linear',

  // Field affordances
  eye: 'eye-linear',
  eyeOff: 'eye-closed-linear',
  check: 'check-circle-linear',
  /** The email field's leading glyph. */
  email: 'letter-linear',
  /** The name / username field's leading glyph. */
  person: 'user-linear',
  /**
   * The password field's leading glyph. A plain padlock, not the keypad-faced
   * `lock-password` — at 20px in a field the keypad dots read as noise rather
   * than as detail.
   */
  lock: 'lock-linear',
  /**
   * Passkey sign-in. Solar has no fingerprint or biometric glyph, so a key
   * stands in — the same association the term "passkey" itself trades on.
   */
  passkey: 'key-linear',
  /** Mars symbol — the male option in the client sex field. */
  male: 'men-linear',
  /** Venus symbol — the female option in the client sex field. */
  female: 'women-linear',

  /**
   * The navigation node — the mark that travels to the active item. A leaf
   * rather than a plain dot: this is a nutrition product, and the shape is the
   * one place in the chrome where the brand gets to say so.
   */
  navNode: 'leaf-linear',

  /**
   * The auth screens' illustration — one huge leaf filling the brand panel of
   * the sign-in card, standing in for artwork that does not exist yet.
   *
   * The same Solar glyph as `navNode` and deliberately a second entry: the node
   * is chrome and this is decoration, so either can be redrawn without dragging
   * the other with it.
   */
  leaf: 'leaf-linear',

  // Status — pairs with the status token of the same name
  attention: 'danger-triangle-linear',
  medical: 'danger-circle-linear',
  info: 'info-circle-linear',

  // Dashboard
  notifications: 'bell-bing-linear',
  topClients: 'cup-star-linear',
  clock: 'clock-circle-linear',
  addClient: 'user-plus-linear',
  bookAppointment: 'calendar-add-linear',
  trend: 'graph-up-linear',
  /** A quick-action tile that navigates out to another page. Fixed — points top-left regardless of locale. */
  linkArrow: 'arrow-left-up-linear',

  /**
   * The client's plan — one mark per meal slot, keyed by `mealTypeForSlot`.
   *
   * Time of day rather than specific foods: the plan's dishes are Palestinian,
   * and a plate of pasta on every lunch would be telling the client something
   * about the food that the plan does not say. Solar has no fruit or cutlery
   * glyph, so `plate` and a bitten `donut` stand in for the main meal and the
   * snack.
   *
   * **These four are read side by side, stacked, at 24px** — the planner's slot
   * rail is the only place in the app where a set of icons is compared rather
   * than glanced at, so they are chosen for distinct *silhouettes* first: a
   * rayed disc, a plate, a bitten ring, a crescent with stars. Two glyphs that
   * differ only in their interior detail read as the same mark in that column.
   *
   * ⚠ Breakfast is `sun`, **not** `sunrise`. A sunrise glyph is a sun drawn
   * above a horizontal bar, and at this size that bar stops reading as a horizon
   * and starts reading as the edge of a box the sun is sitting inside — so the
   * one icon on the rail with a straight line in it looked like it had a card
   * behind it and the other three did not.
   *
   * ⚠ The snack is **not** `cup-hot`, which is already `dishes` — the staff
   * rail's catalog mark, visible beside the board on every wide screen. The same
   * picture meaning two things on one screen is worse than a duller glyph.
   */
  mealBreakfast: 'tea-cup-linear',
  mealSnack: 'donut-bitten-linear',
  /*
   * ⚠ Lunch is `plate`, **not** `chef-hat`, which `main` briefly had it as.
   * `dish` below is already `chef-hat-linear` — the mark for the dish itself on a
   * meal card — so a chef-hat lunch put the same picture twice on one row,
   * which is exactly what the snack note above refuses to do. It also left the
   * four-silhouette set described above (rayed disc, plate, bitten ring,
   * crescent) without its plate or its crescent.
   */
  mealLunch: 'plate-linear',
  mealDinner: 'moon-stars-linear',

  /**
   * The same four slots on the *client's* plan card.
   *
   * The second of the old linear exceptions, and the one that still earns its
   * separate entry on picture alone: breakfast here is a `sun`, not the
   * planner's `tea-cup`. The client's card is a row you scan five of, and the
   * sun says "morning" faster than a cup does to someone who is not reading a
   * schedule.
   *
   * Most `-linear` bodies carry their own `fill="none" stroke="currentColor"`
   * and so survive `Icon`'s `fill="currentColor"` on the parent `<svg>`. A
   * handful (`phone`, `refresh`, `eye-closed`, `heart`) are drawn instead as
   * filled outline paths — the stroke is expanded into the path itself — and
   * render correctly either way. Nothing here needs a special case; the note
   * exists so the next person does not go looking for a bug when two icons in
   * this file are built differently.
   */
  mealBreakfastOutline: 'sun-linear',
  mealSnackOutline: 'donut-bitten-linear',
  mealLunchOutline: 'plate-linear',
  mealDinnerOutline: 'moon-stars-linear',

  /**
   * The planner's row markers and add-slot picker.
   *
   * A *different set* from `meal*Outline` above, not a duplicate of it: those
   * four are the client's plan card, these are the staff planner's rail and its
   * add-slot picker, which needs four more glyphs the portal has no use for.
   * `meal-icons.ts` maps slots onto them and is tested.
   *
   * These are the four that are compared side by side rather than glanced at,
   * so the silhouette rule in the block above applies to them hardest.
   */
  plannerMealBreakfast: 'tea-cup-linear',
  plannerMealSnack: 'donut-bitten-linear',
  plannerMealLunch: 'chef-hat-linear',
  plannerMealDinner: 'plate-linear',
  plannerMealHotDrink: 'cup-hot-linear',
  plannerMealBottle: 'bottle-linear',
  plannerMealChefHeart: 'chef-hat-heart-linear',
  plannerMealChefMinimal: 'chef-hat-minimalistic-linear',

  /** The dish itself, on a meal card. Constant — no dish carries its own icon. */
  dish: 'chef-hat-linear',
  /** A client's requests about an appointment, which are a conversation. */
  chat: 'chat-round-line-linear',

  /**
   * The client's own record screen — section headers and row markers.
   *
   * The third of the old linear exceptions, and the one whose argument the
   * whole app has now adopted: this screen is a stack of read-only facts, and a
   * filled glyph beside every heading and every second row turned a page you
   * *read* into a page of marks.
   *
   * Several of these now match their staff-side twin exactly — `phoneOutline`
   * is `contact`, `chatOutline` is `chat`. Kept as separate names so the two
   * sides can diverge again without a sweep through the portal.
   */
  personOutline: 'user-linear',
  heartOutline: 'heart-linear',
  clinicOutline: 'hospital-linear',
  phoneOutline: 'phone-linear',
  emailOutline: 'letter-linear',
  locationOutline: 'map-point-linear',
  clockOutline: 'clock-circle-linear',
  infoOutline: 'info-circle-linear',
  mapOutline: 'map-linear',
  chatOutline: 'chat-round-line-linear',

  /**
   * One glyph per field of the health record, so a row is findable by its mark
   * rather than only by reading its label.
   *
   * **The glyph is what tells these apart, not a colour.** Every tile and badge
   * on that screen carries the same olive; distinguishing five fields by hue
   * would need five hues, and this palette has two support colours, both of
   * which already mean something (amber is "needs follow-up", clay is the only
   * alarm). It is the argument the meal cards already make — one tone for all of
   * them, the icon and the label carry the difference.
   */
  goalOutline: 'target-linear',
  heightOutline: 'ruler-linear',
  activityOutline: 'walking-linear',
  weightOutline: 'scale-linear',
  conditionsOutline: 'shield-plus-linear',
  allergiesOutline: 'leaf-linear',
  medicationsOutline: 'pill-linear',
  careNoteOutline: 'notes-linear',
  /** The clinic as an organisation, on its name row. */
  clinicNameOutline: 'users-group-rounded-linear',

  // Portal settings — destination rows
  help: 'question-circle-linear',
  privacy: 'shield-check-linear',
  /** Terms of service. Distinct glyph from `myPlanFeatured`'s document-text-linear. */
  terms: 'file-text-linear',
  /**
   * The closing offer on the help screen — "still stuck? talk to us".
   *
   * Not `help`'s question mark, deliberately: that glyph is what the settings
   * list uses to *get to* the help screen, and repeating it at the bottom of
   * the page it leads to would mark the exit with the same sign as the entrance.
   */
  suggestion: 'lightbulb-linear',

  /**
   * ── Client portal ──
   *
   * These replaced the last fourteen `lucide-react` imports in the portal. The
   * design system allows the app **one** icon set, and a second family had grown
   * back one glyph at a time — a lucide flame beside a Solar chevron on the same
   * row, at a different optical weight and on a different grid.
   *
   * Named for the role, like everything above: `dayComplete` rather than
   * `flame`, so the picture can be redrawn without touching a call site.
   */

  /** A day the client finished — the week strip's mark and the header's count. */
  dayComplete: 'fire-linear',
  /**
   * The greeting header's daytime mark, beside the client's name.
   *
   * `sun-linear`, the same body as `mealBreakfastOutline`. Both mean "morning",
   * they never appear on the same row, and a separate entry lets the greeting
   * change without dragging the plan card's breakfast with it.
   */
  greetingSun: 'sun-linear',

  /**
   * The adherence card's growth mark — one leaf for the streak it is counting.
   *
   * `leaf-linear` again, after `navNode` and `leaf`. Three names on one body is
   * the same trade those two already make: chrome, decoration and this are
   * three things that happen to look alike today.
   */
  streak: 'leaf-linear',
  /** The "you are keeping this up" chip under the streak figure. */
  encouragement: 'shield-check-linear',

  /**
   * The clinic's opening and closing time, on the hours row.
   *
   * ⚠ The `mealBreakfast` note above rejects `sunrise` for the planner's slot
   * rail, because a sun over a horizon bar reads as a sun in a box at 24px in a
   * column of four. It is the right glyph *here*: these two are a pair, read
   * side by side against each other rather than against three other meals, and
   * the horizon is exactly what distinguishes rising from setting.
   */
  opensAt: 'sunrise-linear',
  closesAt: 'sunset-linear',

  /**
   * The five daily check-in metrics on the progress tab.
   *
   * Solar has no cutlery, so appetite takes `plate` — the same body as
   * `mealLunch`. The rule the snack note sets is "not the same picture twice on
   * one screen", and the planner's slot rail is a staff screen the client never
   * sees.
   */
  checkInEnergy: 'bolt-linear',
  checkInSleep: 'moon-linear',
  checkInAppetite: 'plate-linear',
  checkInMood: 'smile-circle-linear',
  checkInWater: 'waterdrop-linear',

  /**
   * The settings screen's three section headers.
   *
   * ⚠ Support is **not** `question-circle`, which is already `help` — the row
   * *inside* this section that opens the help screen. Marking a section with
   * the same glyph as one of its own rows is the mistake the `suggestion` note
   * above spells out.
   */
  settingsAccount: 'user-circle-linear',
  settingsPreferences: 'tuning-4-linear',
  settingsSupport: 'headphones-round-linear',

  /**
   * The pushed screen's back control. A full arrow rather than `chevronStart`:
   * the chevrons are affordances on a row you can open, and this is the way
   * out of a screen. Mirrors in RTL — see DIRECTIONAL in `icon.tsx`.
   */
  back: 'arrow-left-linear',
} as const satisfies Record<string, string>;

type SolarIcon = { body: string; width?: number; height?: number };

const collection = solar as unknown as {
  width?: number;
  height?: number;
  icons: Record<string, SolarIcon>;
  aliases?: Record<string, { parent: string }>;
};

function resolve(name: string): SolarIcon {
  const direct = collection.icons[name];
  if (direct) return direct;

  // Solar expresses some names as aliases of another icon's body.
  const alias = collection.aliases?.[name];
  if (alias) return resolve(alias.parent);

  throw new Error(`Icon "${name}" is not in @iconify-json/solar.`);
}

const defaultWidth = collection.width ?? 24;
const defaultHeight = collection.height ?? 24;

const entries = Object.entries(ICONS).map(([local, solarName]) => {
  const icon = resolve(solarName);
  const width = icon.width ?? defaultWidth;
  const height = icon.height ?? defaultHeight;

  return `  ${local}: {
    // solar:${solarName}
    viewBox: '0 0 ${width} ${height}',
    body: ${JSON.stringify(icon.body)},
  },`;
});

const output = `/**
 * GENERATED FILE — do not edit.
 *
 * Run \`bun run icons:generate\` to regenerate. The icon list lives in
 * scripts/generate-icons.ts; see that file for how to add one.
 *
 * Source: Solar Linear (https://icon-sets.iconify.design/solar/), MIT.
 */

export type IconName = keyof typeof QIWAM_ICONS;

export const QIWAM_ICONS = {
${entries.join('\n')}
} as const satisfies Record<string, { viewBox: string; body: string }>;
`;

const target = join(import.meta.dirname, '..', 'src', 'lib', 'icons.generated.ts');
await mkdir(dirname(target), { recursive: true });
await writeFile(target, output, 'utf8');

console.log(`Wrote ${Object.keys(ICONS).length} icons to ${target}`);
