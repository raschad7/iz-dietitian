import { type NavItem } from '@/components/layout/sidebar';

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
