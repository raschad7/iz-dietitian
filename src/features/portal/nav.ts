import { type NavItem } from '@/components/layout/sidebar';
import { type IconName } from '@/components/ui/icon';

/**
 * The portal's tab destinations, in one place.
 *
 * Two components render this list — the sidebar on a wide screen and the bottom
 * tab bar on a phone — and they must never drift apart. Typed as the sidebar's
 * own `NavItem`, so adding a route here without adding it to that union is a
 * compile error rather than a link to nowhere.
 *
 * Profile is a tab like the others: it still opens from the avatar tap and
 * the drawer as well, at the same `/portal/profile` route, so those shortcuts
 * keep working unchanged.
 *
 * Account settings sits one step further in, behind the drawer, and is not in
 * this list. The two are separate screens on purpose: the profile is a clinical
 * record somebody else wrote, and settings is the handful of things the client
 * actually decides.
 *
 * There used to be a fifth tab, the plan — it now lives on the home screen
 * itself, directly below today's progress, so opening the plan and opening
 * home are the same tap.
 */
export const PORTAL_NAV = [
  { href: '/portal', labelKey: 'portalHome' },
  { href: '/portal/appointments', labelKey: 'myAppointments' },
  { href: '/portal/progress', labelKey: 'progress' },
  { href: '/portal/profile', labelKey: 'profile' },
] as const satisfies readonly NavItem[];

export type PortalLabelKey = (typeof PORTAL_NAV)[number]['labelKey'];

/**
 * The glyph for each destination, shared by the rail and the bottom bar for the
 * same reason the list itself is: a client who learns an icon on their phone
 * must find the same one on a laptop.
 *
 * The `*Outline` names are what is left of a filled/linear split the set no
 * longer has — lucide is one weight throughout, so each of these now resolves
 * to the same glyph as its plain twin. They stay because the reason still
 * holds: the bottom bar marks the active tab with colour and a lift
 * (`PortalTabBar`), so if the set ever gains a second weight, this is the list
 * that must not take it.
 */
export const PORTAL_NAV_ICONS = {
  portalHome: 'portalHomeOutline',
  myAppointments: 'myAppointmentsOutline',
  progress: 'progressOutline',
  profile: 'profileOutline',
} as const satisfies Record<PortalLabelKey, IconName>;
