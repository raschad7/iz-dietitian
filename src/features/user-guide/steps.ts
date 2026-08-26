import type { IconName } from '@/lib/icons';

/**
 * The guided tour of the staff app, in the order it is walked.
 *
 * ## What this is
 *
 * A dietitian opening Enzyme for the first time has five sections in the rail and
 * no way of knowing that a patient is added from a dialog over the register, that
 * a booking is dragged out of the calendar grid rather than typed into a form, or
 * that the dish catalog is what the planner draws from. None of that is *hidden*
 * — it is simply not the kind of thing a screen can say about itself while also
 * being the screen.
 *
 * So the guide says it, over the real app: it walks the sections in the order a
 * working day uses them, dims the page, and cuts a hole around the one control
 * each step is about.
 *
 * ## The one rule these steps follow
 *
 * **A step points; it never presses.** Every flow the tour describes — the
 * requests inbox, the client card, the dish builder — opens a dialog held in a
 * component's own `useState`, and a guide that reached in to open them would be
 * a second thing able to put the app into a state the app did not ask for. It
 * would also be a guide that can create a real patient by accident.
 *
 * The cost is that the tour describes the dialogs rather than showing their
 * insides. That is the right trade for a first-run walkthrough: what a newcomer
 * does not know is *where the way in is*, and once they are standing in front of
 * it with its name read out, the dialog explains itself.
 *
 * ## Adding a step
 *
 * Add an entry here, add `data-guide="<anchor>"` to the element it points at,
 * and add `userGuide.steps.<id>.title` / `.body` to both message files. Nothing
 * else knows the tour's shape — the overlay reads this array and counts it.
 */

/**
 * Where a step's card prefers to sit relative to its anchor, on screens wide
 * enough to have a choice. Logical rather than physical, so a tour reads the
 * same way in Arabic: `inline-end` is to the right of the anchor in English and
 * to its left in Arabic.
 *
 * It is a preference, not a promise. `GuideCard` flips to the opposite side and
 * then clamps to the viewport when the preferred side has no room, which is why
 * a step that guesses wrong is a cosmetic problem rather than a broken one.
 */
export type GuideSide = 'block-start' | 'block-end' | 'inline-start' | 'inline-end';

/**
 * A route the tour is allowed to send the reader to.
 *
 * The two calendar entries carry a query string because day, week and month are
 * one route told apart by `?view=` — see `app/[locale]/app/calendar/page.tsx`.
 * They were `/app/calendar/week` and `/app/calendar/day`, which are now
 * redirects: sending the tour through one would cost it a server hop and land
 * the reader on the screen by *replacing* the one it had just drawn, which is
 * the mount-then-correct jitter the note on {@link stepHrefForScreen} exists to
 * prevent. Naming the real address avoids the hop entirely.
 */
export type GuideHref =
  | '/app'
  | '/app/clients'
  | '/app/calendar?view=week'
  | '/app/calendar?view=day'
  | '/app/weekly-plans'
  | '/app/dishes';

/**
 * The shape each entry in {@link GUIDE_STEPS} has to have.
 *
 * The exported step type is {@link GuideStep}, which is read back *off* the
 * array rather than declared here — see the note there. This one exists only so
 * the array can be checked against it with `satisfies`, which validates every
 * entry without widening `id` and `section` back to `string`.
 */
type GuideStepShape = {
  /**
   * Stable id. It is the message key (`userGuide.steps.<id>.*`) and React's
   * key, so renaming one is a copy change as much as a code change.
   */
  id: string;
  /** The section this step belongs to; drawn as the card's eyebrow. */
  section: GuideSection;
  /** The screen the reader has to be on. The overlay navigates if they are not. */
  href: GuideHref;
  /**
   * The `data-guide` value of the element to cut out of the dim.
   *
   * `null` means the step has no anchor at all — the opening and closing cards,
   * which are about the tour rather than about anything on the page. Those are
   * drawn centred with no spotlight.
   */
  anchor: string | null;
  /** Preferred placement of the card; see {@link GuideSide}. */
  side?: GuideSide;
  /**
   * Whether a missing anchor is expected.
   *
   * Several anchors belong to states a real clinic may not be in — a register
   * with no clients in it draws an empty state instead of a table, and the
   * planner's suggestion cards need clients with plans. A step marked optional
   * degrades to a centred card with its text intact rather than stalling the
   * tour on an element that was never going to appear.
   */
  optional?: boolean;
};

/**
 * What the card's eyebrow says: the five sections of the app, in the order the
 * tour walks them, plus `intro` for the two opening steps.
 *
 * `intro` is not a place in the app, and it earns its own name for that reason.
 * The welcome card and the tour of the rail are about the app as a whole, and
 * labelling them "Dashboard" — the screen they happen to be standing on — would
 * have said the reader was being told about the dashboard when they were not.
 */
export type GuideSection = 'intro' | 'dashboard' | 'clients' | 'calendar' | 'planner' | 'dishes';

/** One glyph per section, so the card's eyebrow is scannable at a glance. */
export const GUIDE_SECTION_ICONS = {
  intro: 'guide',
  dashboard: 'dashboard',
  clients: 'clients',
  calendar: 'calendar',
  planner: 'weeklyPlans',
  dishes: 'dishes',
} as const satisfies Record<GuideSection, IconName>;

/**
 * The tour.
 *
 * Ordered the way a day is: what is waiting for you, who you are seeing, when
 * you are seeing them, what they will eat, and what the food itself is made of.
 * That is also the order the rail lists the sections in, so the tour never sends
 * anyone backwards through their own navigation.
 */
export const GUIDE_STEPS = [
  /* — Opening. No anchor: this one is about the tour, not about the page. — */
  { id: 'welcome', section: 'intro', href: '/app', anchor: null },

  /*
    The rail first, because it is the one thing on screen that is true on every
    other screen. Every step after this is somewhere the rail can reach.
  */
  { id: 'navigation', section: 'intro', href: '/app', anchor: 'nav', side: 'inline-end' },

  /* — Dashboard — */
  { id: 'dashboardStats', section: 'dashboard', href: '/app', anchor: 'dashboard-stats', side: 'block-end' },
  {
    id: 'dashboardRequests',
    section: 'dashboard',
    href: '/app',
    anchor: 'dashboard-requests',
    side: 'block-end',
  },
  {
    id: 'dashboardAgenda',
    section: 'dashboard',
    href: '/app',
    anchor: 'dashboard-agenda',
    side: 'block-start',
  },

  /* — Clients: the register, and the way a new patient joins it. — */
  { id: 'clientsRegister', section: 'clients', href: '/app/clients', anchor: 'clients-table', side: 'block-start', optional: true },
  { id: 'clientsSearch', section: 'clients', href: '/app/clients', anchor: 'clients-search', side: 'block-end' },
  { id: 'clientsNew', section: 'clients', href: '/app/clients', anchor: 'clients-new', side: 'block-end' },

  /* — Calendar: booking is a gesture on the grid, which is the whole reason
       this section needs a guide at all. — */
  { id: 'calendarToolbar', section: 'calendar', href: '/app/calendar?view=week', anchor: 'calendar-toolbar', side: 'block-end' },
  { id: 'calendarBooking', section: 'calendar', href: '/app/calendar?view=week', anchor: 'calendar-grid', side: 'block-start' },

  /* — Weekly plans — */
  { id: 'plannerPicker', section: 'planner', href: '/app/weekly-plans', anchor: 'planner-picker', side: 'block-end' },
  { id: 'plannerBoard', section: 'planner', href: '/app/weekly-plans', anchor: 'planner-suggestions', side: 'block-start', optional: true },

  /* — Dish catalog: where the tour ends, because it is what the planner draws
       from and the last thing a new clinic has to fill. — */
  { id: 'dishesCatalog', section: 'dishes', href: '/app/dishes', anchor: 'dishes-list', side: 'block-start', optional: true },
  { id: 'dishesFilters', section: 'dishes', href: '/app/dishes', anchor: 'dishes-filters', side: 'block-end' },
  { id: 'dishesAdd', section: 'dishes', href: '/app/dishes', anchor: 'dishes-add', side: 'block-end' },

  /* — Closing. Centred, like the opening. — */
  { id: 'finish', section: 'dishes', href: '/app/dishes', anchor: null },
] as const satisfies readonly GuideStepShape[];

/**
 * A step, with its `id` and `section` as literals rather than as `string`.
 *
 * Derived from the array instead of being the annotation on it, and that is
 * load-bearing: `t('steps.' + step.id + '.title')` is only type-safe if the
 * compiler knows `id` is one of sixteen known words. Annotating the array
 * `readonly GuideStep[]` would widen them to `string` and hand next-intl a key
 * it cannot check — which is exactly how a step ships with a title and no body
 * and nobody finds out until the card is on screen.
 *
 * `satisfies` above is what keeps the checking in both directions: the array
 * still has to match {@link GuideStepShape}, so a typo in `section` or an
 * `href` the tour is not allowed to visit is a compile error.
 */
export type GuideStep = (typeof GUIDE_STEPS)[number];

export const GUIDE_STEP_COUNT = GUIDE_STEPS.length;

/*
 * `GuideStep` being a union of exact object shapes is what makes these two
 * readers necessary: a step that never wrote `side` has no `side` property at
 * all, rather than one holding `undefined`, so `step.side` does not type-check
 * across the union. `in` narrows it correctly and states the default in one
 * place instead of at every call site.
 */

/** The step's preferred side, or the default every unstated step gets. */
export function stepSide(step: GuideStep): GuideSide {
  return 'side' in step ? step.side : 'block-end';
}

/** Whether a missing anchor is expected for this step. See `optional` above. */
export function stepIsOptional(step: GuideStep): boolean {
  return 'optional' in step ? step.optional : false;
}

/**
 * Routes whose children are all the same *screen* as far as the tour is
 * concerned, so a step naming one of them is satisfied by any of its children.
 *
 * ## Why this exists
 *
 * A step names one exact path, and the provider walks the reader to it whenever
 * they are not on it. That is the right rule for a screen the app will leave
 * alone, and the calendar is not one: `CalendarViewGuard` sends any phone that
 * lands on `/app/calendar/week` or `/month` straight to `/app/calendar/day`,
 * because those two views need a width a phone has not got.
 *
 * Between them those two correct rules made an infinite loop. The guide pushed
 * `/app/calendar/week`, the guard replaced it with `/app/calendar/day`, the
 * guide saw a path that was not the step's and pushed `week` again — for as long
 * as the step was on screen. The anchor was not moving; it was being unmounted
 * and rebuilt several times a second, and every measurement the spotlight took
 * was of a different element.
 *
 * ## This is the second line of defence, not the first
 *
 * Accepting where the guard landed stops the loop. It does not stop the *first*
 * push, and that one push is still visible: a phone entering step 9 rendered a
 * full week grid, then had it swapped for the day view a frame later, which is
 * a whole screen changing under a card that has just told the reader to look at
 * it. {@link stepHrefForScreen} is what removes that — a phone is walked
 * straight to the day view and the week is never mounted at all.
 *
 * So this predicate is what keeps the two rules from disagreeing *afterwards*:
 * the guard and the tour read the same breakpoint, but they read it at
 * different moments, and a tablet rotated mid-step is enough to make one of
 * them answer differently. Without this, that disagreement is the loop again.
 *
 * ## Why the tour yields rather than the guard
 *
 * The guard is answering a question about the device, and it is right. The tour
 * is expressing a preference about which view illustrates the step best, and on
 * a screen that cannot draw a week, the day view is what the reader has — so it
 * is also what the step should be describing. Both calendar anchors exist in the
 * day view, so the two steps read correctly there without any other change.
 *
 * Written as a root list rather than as a rule about the calendar so the next
 * screen that redirects within itself is one line here, not another loop.
 */
const GUIDE_SCREEN_ROOTS = ['/app/calendar'] as const;

/**
 * Where a step goes instead, on a screen too narrow for the view it names.
 *
 * One entry, and it is the calendar: `CalendarViewGuard` offers a phone the day
 * view and nothing else, so a step asking for the week is asking for something
 * this device does not have. Declared as a map rather than as an `if` so the
 * next step that names a view some screen declines to show is a line here.
 *
 * Both sides are `GuideHref`, so a substitution can only ever point at a route
 * the tour is already allowed to visit.
 */
const NARROW_SCREEN_HREFS: Partial<Record<GuideHref, GuideHref>> = {
  '/app/calendar?view=week': '/app/calendar?view=day',
};

/**
 * The screen this step should actually be walked to, on this device.
 *
 * ## Why the tour resolves this itself
 *
 * It could let the guard correct it, and for one release it did: the tour pushed
 * the week view, the guard replaced it with the day view, and — once
 * {@link stepScreenMatches} stopped the two from arguing about it — the reader
 * ended up in the right place. "Ends up in the right place" is not the same as
 * "was never in the wrong one", though. The week grid mounted, laid out, painted
 * and was thrown away, and what the reader saw was the entire screen changing
 * out from under a card that had just asked for their attention. On steps 9 and
 * 10 that is the jitter, and it survived every fix aimed at how the spotlight is
 * drawn, because the spotlight was drawing a page that really was being replaced.
 *
 * The guard exists for URLs the tour does not control — a bookmark, a shared
 * link, a rotated tablet. The tour does control its own, so the correction it
 * can make before navigating is one the reader never has to watch.
 *
 * `narrow` is passed in rather than read from `matchMedia` here so this stays a
 * pure function with a test, and so the one place that owns the breakpoint stays
 * `CALENDAR_PHONE_QUERY`.
 *
 * @param href The screen the step declares.
 * @param narrow Whether the viewport is below `CALENDAR_PHONE_QUERY`.
 */
export function stepHrefForScreen(href: GuideHref, narrow: boolean): GuideHref {
  return (narrow ? NARROW_SCREEN_HREFS[href] : undefined) ?? href;
}

/**
 * Whether the reader is already on the screen this step belongs to.
 *
 * Exact equality everywhere except under a {@link GUIDE_SCREEN_ROOTS} root,
 * where any child counts. The boundary is checked with a trailing slash so a
 * future `/app/calendar-settings` cannot be mistaken for a calendar view.
 *
 * ⚠ **Both sides are reduced to their path first, and that is load-bearing.**
 * A step's href now carries the calendar's `?view=`, while `pathname` never
 * carries a query at all — so comparing the two raw strings could never match a
 * reader who was standing on exactly the screen the step asked for. Stripping
 * the query is also what keeps the week step satisfied by the day view a phone
 * is corrected to: the three views are one screen, and this predicate asks
 * "which screen", not "which view of it".
 */
export function stepScreenMatches(href: GuideHref, pathname: string): boolean {
  const hrefPath = href.split('?')[0] ?? href;
  const path = pathname.split('?')[0] ?? pathname;

  if (path === hrefPath) return true;

  return GUIDE_SCREEN_ROOTS.some(
    (root) => hrefPath.startsWith(root) && (path === root || path.startsWith(`${root}/`)),
  );
}
