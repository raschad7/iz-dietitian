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
 * Profile is a tab like the other four: it still opens from the avatar tap and
 * the drawer as well, at the same `/portal/profile` route, so those shortcuts
 * keep working unchanged.
 *
 * Account settings sits one step further in, behind the drawer, and is not in
 * this list. The two are separate screens on purpose: the profile is a clinical
 * record somebody else wrote, and settings is the handful of things the client
 * actually decides.
 */
export const PORTAL_NAV = [
  { href: '/portal', labelKey: 'portalHome' },
  { href: '/portal/meal-plan', labelKey: 'myPlan' },
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
 * Every key happens to name its own icon in the generated registry, so this
 * reads as an identity map. It is written out anyway — `satisfies` then makes
 * adding a destination without an icon a compile error rather than a blank slot.
 */
export const PORTAL_NAV_ICONS = {
  portalHome: 'portalHome',
  myAppointments: 'myAppointments',
  myPlan: 'myPlan',
  progress: 'progress',
  profile: 'profile',
} as const satisfies Record<PortalLabelKey, IconName>;
