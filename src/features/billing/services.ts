import type { IconName } from '@/components/ui/icon';

/**
 * The services a clinic bills for.
 *
 * One list, read by the charge card that records a service and by the settings
 * section that prices one. It lived in `record-charge-dialog.tsx` while the
 * charge card was the only thing that knew about services; the price list is
 * the second reader, and two copies of a catalogue are two catalogues.
 *
 * **This is the list anybody should expect to edit.** Adding a service is a
 * line here, a pair of strings under `billing.services`, and nothing else —
 * prices are rows keyed by `value`, so there is no migration and no column.
 *
 * `as const` and not a typed array: it keeps the values a union of literals
 * rather than `string`, which is what lets the `services.` lookups be checked
 * against the message catalogue. A service added here without its strings is a
 * compile error, not a `services.massage` printed on a bill.
 *
 * Tints from the app's own status ramps rather than raw colour, so the
 * pill says which service was chosen from across the card — the way the
 * wallet's pill says cash or card without being read. They are told apart, not
 * graded: unlike the wallet's green and amber, none of these says anything
 * about money. A service is not on track or outstanding; it is simply the one
 * that was given.
 *
 * **The two subscriptions share a tint on purpose.** Monthly and quarterly are
 * the same thing bought for a different length, and colouring them apart said
 * they differed in kind. What tells them apart is the icon and the words —
 * `repeat` against `calendar` — and the tint is freed to mark the split that
 * actually changes what the ledger does with the row: a term, or a single
 * visit. A term is blue and a single visit is the neutral grey.
 *
 * Blue rather than the on-track green they used to share: green is what the
 * paid figure and the on-track chip are drawn in, so a subscription wearing
 * it said something about money on a control that only names what was sold.
 * Grey claims nothing at all, which is what a consultation should claim.
 */
export const BILLING_SERVICES = [
  { value: 'monthly', icon: 'repeat', className: 'bg-blue-tint text-blue' },
  { value: 'quarterly', icon: 'calendar', className: 'bg-blue-tint text-blue' },
  { value: 'consultation', icon: 'medical', className: 'bg-status-incomplete-bg text-status-incomplete-fg' },
] as const satisfies readonly { value: string; icon: IconName; className: string }[];

/**
 * The consultation, named rather than spelled out at each use.
 *
 * It is the one service with a rule attached — the first one a subscriber has
 * is free — so the key is read in three places, and a typo in any of them would
 * be a rule that silently stops applying.
 */
export const CONSULTATION = 'consultation';

/** A service's key — `monthly`, `quarterly`, `consultation`. */
export type BillingService = (typeof BILLING_SERVICES)[number]['value'];

/** Whether a string names a service this clinic offers. */
export function isBillingService(value: unknown): value is BillingService {
  return BILLING_SERVICES.some((service) => service.value === value);
}

/**
 * What each service costs, in minor units — `null` where no price is set.
 *
 * `null` and not `0`: a clinic that has not decided what to charge is not a
 * clinic charging nothing, and the two look identical in a table of figures.
 * The settings screen says "not set" for one and `₪0` for the other.
 */
export type ServicePrices = Record<BillingService, number | null>;
