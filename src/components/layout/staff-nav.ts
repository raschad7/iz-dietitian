import { type NavLabelKey, type NavNode } from '@/components/layout/sidebar';
import { type IconName } from '@/components/ui/icon';

/**
 * The dietitian's navigation, as a tree.
 *
 * It was a flat list of five destinations. The five are still all here and
 * still the only places a working day is spent — nothing was added and nothing
 * was hidden — but they are grouped now, because five unrelated rows in a
 * column say nothing about how the app is organised and a reader had to learn
 * the order rather than read it.
 *
 * ```text
 * لوحة التحكم
 * إدارة ▾            المشتركون · الفواتير
 * المواعيد ▾         التقويم ▾    يوم · أسبوع · شهر
 * الخطط الغذائية ▾   الخطط الأسبوعية · كتالوج الأطباق
 * ```
 *
 * **The dashboard stays a top-level row.** It is not a section, it is the
 * place you land, and burying the app's own front door one press deep would
 * have been the one regression a hierarchy can cause.
 *
 * **الفواتير sits beside المشتركون, under إدارة.** Billing arrived on `dev` as
 * a sixth flat row, having tried and dropped a "Subscriber" group holding the
 * register and the bills — the objection being that a group put a click in
 * front of the register, the screen most of a day is spent on, and that on a
 * phone (where the rail is locked to its icon column) that click was a dropdown
 * and the *only* way to either screen.
 *
 * That objection is answered rather than overruled: folded, this rail does not
 * draw categories at all. `flatten()` walks إدارة through to its children, so
 * the 56px strip a phone gets is six flat glyphs — the register and the bills
 * among them, each one tap from anywhere, exactly what `dev` was protecting.
 * The grouping is what the expanded column shows, and only there.
 *
 * The routes did not move: `/app/clients` and `/app/clients/bills` are what
 * they were, and `isItemActive` in `sidebar.tsx` is what stops the URL's
 * nesting from lighting both rows at once.
 *
 * **التقويم is a category and a destination at once.** Its three children are
 * views of one screen rather than three screens, which is why it carries
 * `collapsedHref`: folded to the icon rail the whole section is one row
 * pointing at the week. Expanded, opening it is how you pick a view, and the
 * calendar's own toolbar keeps its segmented control for the same job on the
 * page itself — the rail is the way in, not the only way across.
 *
 * **Requests is deliberately not a destination.** The inbox is reached from the
 * dashboard's requests card and from the notifications feed, both of which
 * appear only when something is actually pending. A permanent rail row for it
 * was a row that said "nothing" on most days; the card that does have something
 * to say is the way in. See `PendingRequestsCard`.
 *
 * Profile, WhatsApp and security are not here either. They are behind the
 * profile menu at the foot of the rail — see `SidebarProfile` — so this list is
 * only screens, and none of them are duplicated there.
 */
export const STAFF_NAV = [
  { href: '/app', labelKey: 'dashboard' },
  {
    id: 'management',
    labelKey: 'management',
    children: [
      /* The register, under the plural the clinic uses for the people in it.
         `dev`'s flat rail said `subscriber` ("المشترك") because the row stood
         next to Bills with nothing above the two to name them; here إدارة is
         that name, so the row goes back to naming the list. Both keys exist in
         the `nav` namespace. */
      { href: '/app/clients', labelKey: 'clients' },
      /* The money half of the same people. */
      { href: '/app/clients/bills', labelKey: 'bills' },
    ],
  },
  {
    id: 'appointments',
    labelKey: 'appointments',
    children: [
      {
        id: 'calendar',
        labelKey: 'calendar',
        collapsedHref: '/app/calendar?view=week',
        children: [
          { href: '/app/calendar?view=day', labelKey: 'day' },
          { href: '/app/calendar?view=week', labelKey: 'week' },
          { href: '/app/calendar?view=month', labelKey: 'month' },
        ],
      },
    ],
  },
  {
    id: 'plans',
    labelKey: 'plans',
    children: [
      { href: '/app/weekly-plans', labelKey: 'weeklyPlans' },
      { href: '/app/dishes', labelKey: 'dishes' },
    ],
  },
] as const satisfies readonly NavNode[];

/**
 * One glyph per row — categories included, because a category is a row like any
 * other and a text-only one in a column of iconed ones reads as a heading
 * rather than as something to press.
 *
 * The exception is day / week / month. They are the third level, they are three
 * words of one syllable, and a glyph for each would be three marks distinguished
 * only by the number printed on them; the indentation and the label are enough
 * that deep in.
 *
 * `satisfies` ties this to the label keys, so a typo is a compile error rather
 * than a row that quietly sits misaligned.
 */
export const STAFF_NAV_ICONS = {
  dashboard: 'dashboard',
  management: 'management',
  clients: 'clients',
  bills: 'bills',
  appointments: 'appointments',
  calendar: 'calendar',
  plans: 'mealPlans',
  weeklyPlans: 'weeklyPlans',
  dishes: 'dishes',
} as const satisfies Partial<Record<NavLabelKey, IconName>>;
