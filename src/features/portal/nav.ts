import { type NavItem } from '@/components/layout/sidebar';
import { type IconName } from '@/components/ui/icon';

/**
 * The portal's four destinations, in one place.
 *
 * Two components render this list — the sidebar on a wide screen and the bottom
 * tab bar on a phone — and they must never drift apart. Typed as the sidebar's
 * own `NavItem`, so adding a route here without adding it to that union is a
 * compile error rather than a link to nowhere.
 */
export const PORTAL_NAV = [
  { href: '/portal', labelKey: 'portalHome' },
  { href: '/portal/appointments', labelKey: 'myAppointments' },
  { href: '/portal/meal-plan', labelKey: 'myPlan' },
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
  profile: 'profile',
} as const satisfies Record<PortalLabelKey, IconName>;
