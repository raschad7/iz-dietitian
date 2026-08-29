import { type NavLabelKey, type NavSection } from '@/components/layout/sidebar';
import { type IconName } from '@/components/ui/icon';

/**
 * The dietitian's navigation, as sections.
 *
 * ```text
 * لوحة التحكم
 * التقويم ▾            يوم · أسبوع · شهر
 *
 * إدارة                ← a heading, not a control
 *   المشتركون
 *   الفواتير
 *
 * خطط التغذية
 *   الخطط الأسبوعية
 *   كتالوج الأطباق
 * ```
 *
 * **A section is a label, not a button.** إدارة and خطط التغذية were rows you
 * pressed to reveal what was under them; they are printed headings now and
 * everything they name is on screen at all times. A rail whose shape changes as
 * you use it is a rail you have to re-read on every screen.
 *
 * **Two headings for six destinations, not three.** المواعيد was the third, and
 * it stood over a single row — التقويم — which is a heading that names nothing.
 * The word cost a line, a gap and a second thing to scan on the way to one
 * link, and it said very nearly what the row underneath it already said. The
 * calendar leads the rail with the dashboard instead, in the band that has no
 * heading at all: those two are what the day *is*, and everything below them is
 * a list you go and work in. Six links, two words, and no word over fewer than
 * two things.
 *
 * The cost of printed headings is height, and it is affordable: six
 * destinations and two headings fit a laptop with room to spare. If this list
 * ever outgrows the column, the answer is fewer destinations, not headings that
 * hide them again.
 *
 * **التقويم is the one thing that still opens**, and for a reason no heading
 * covers: يوم, أسبوع and شهر are three *views of one screen* rather than three
 * screens. Printing them flat would put four rows in the rail where the reader
 * only ever thinks about one — and the calendar's own toolbar already carries
 * the same segmented control on the page, so the rail is the way in, not the
 * only way across.
 *
 * **The dashboard's band has no heading.** It is where you land rather than
 * somewhere you go to, so it leads the column with a rule of whitespace under
 * it instead of a word above it — and that whitespace is now naming two rows
 * rather than one.
 *
 * **الفواتير sits beside المشتركون, under إدارة.** Billing arrived on `dev` as
 * a sixth flat row, having tried and dropped a group holding the register and
 * the bills — the objection being that a group put a click in front of the
 * register, the screen most of a day is spent on. That objection is answered
 * twice over now: a heading has no click in front of it at all, and folded to
 * its icon column the rail does not draw sections either. `flatten()` walks
 * straight through to the destinations, so a phone gets six flat glyphs, each
 * one tap from anywhere.
 *
 * The routes did not move: `/app/clients` and `/app/clients/bills` are what
 * they were, and `isItemActive` in `sidebar.tsx` is what stops the URL's
 * nesting from lighting both rows at once.
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
  {
    /* No `labelKey`: an unheaded band, which is how the top of the rail keeps
       its two rows without a word above them naming what they plainly are. */
    id: 'overview',
    children: [
      { href: '/app', labelKey: 'dashboard' },
      /* The calendar moved up here when its own heading — المواعيد, over this
         one row — was dropped. It is a category rather than a destination, and
         a category in the unheaded band is fine: `levelKey` is the band's id,
         so it accordions against its siblings exactly as it did against none. */
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
    id: 'plans',
    labelKey: 'plans',
    children: [
      { href: '/app/weekly-plans', labelKey: 'weeklyPlans' },
      { href: '/app/dishes', labelKey: 'dishes' },
    ],
  },
] as const satisfies readonly NavSection[];

/**
 * One glyph per destination.
 *
 * **Section headings have none.** They used to — إدارة and خطط التغذية were
 * rows, and a text-only row in a column of iconed ones reads as a heading
 * rather than as something to press. That is exactly what they are now,
 * so the glyph that made them look pressable is gone and the icon column below
 * each heading is uninterrupted.
 *
 * التقويم keeps one: it is still a row, and still something you press.
 *
 * Day / week / month have none either. They are the third level, they are three
 * words of one syllable, and a glyph for each would be three marks distinguished
 * only by the number printed on them; the indentation and the label are enough
 * that deep in.
 *
 * `satisfies` ties this to the label keys, so a typo is a compile error rather
 * than a row that quietly sits misaligned.
 */
export const STAFF_NAV_ICONS = {
  dashboard: 'dashboard',
  clients: 'clients',
  bills: 'bills',
  calendar: 'calendar',
  weeklyPlans: 'weeklyPlans',
  dishes: 'dishes',
} as const satisfies Partial<Record<NavLabelKey, IconName>>;
