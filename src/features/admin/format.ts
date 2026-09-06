import { formatCurrency, formatNumber } from '@/lib/format';
import type { Locale } from '@/i18n/routing';

import { microUsdToUsd } from './pricing';

/**
 * How the platform screen writes its figures.
 *
 * Pure and locale-taking, like `src/lib/format.ts`, and kept beside the feature
 * rather than added to it: none of these three questions comes up anywhere else
 * in the product, and a shared module should not grow a "cost of a language
 * model" helper for one screen.
 */

/**
 * A model cost, in US dollars.
 *
 * **US dollars, not the clinic's shekels, and that is not an oversight.** This
 * is what the platform pays OpenAI, billed in dollars; converting it to ILS
 * would need an exchange rate on the day of each call, which nothing records —
 * and the reader of this screen is the person who pays the provider's invoice,
 * not a clinic charging a patient. `DEFAULT_CURRENCY` stays what the subscriber
 * ledger is denominated in and has nothing to do with this number.
 *
 * Precision follows magnitude. A single plan costs a fraction of a cent, so two
 * decimals would print `$0.00` beside every row and make the column useless;
 * four decimals below a dollar keeps those rows readable, and anything above a
 * dollar reads as ordinary money.
 *
 * `null` in, `null` out — the model had no rate, and the caller renders a dash.
 * Never substitute a zero here: zero is a real answer that the `console`
 * transport genuinely produces, and the two must stay distinguishable.
 */
export function formatCost(locale: Locale, microUsd: number | null): string | null {
  if (microUsd === null) return null;

  const usd = microUsdToUsd(microUsd);
  const small = Math.abs(usd) < 1;

  return formatCurrency(locale, usd, 'USD', {
    minimumFractionDigits: small ? 4 : 2,
    maximumFractionDigits: small ? 4 : 2,
  });
}

/**
 * A token count, abbreviated once it stops being readable in full.
 *
 * A platform total runs to seven or eight digits, and a column of those is a
 * column nobody compares. Below ten thousand the exact figure is still the
 * clearest thing to print, so it is printed.
 */
export function formatTokens(locale: Locale, tokens: number): string {
  if (tokens < 10_000) return formatNumber(locale, tokens);

  return formatNumber(locale, tokens, { notation: 'compact', maximumFractionDigits: 1 });
}

/**
 * A duration in milliseconds, as seconds.
 *
 * Every figure this renders is a model call, and those run from a few seconds to
 * the 100-second timeout in `llm.ts`. Milliseconds are noise at that scale, and
 * minutes would round every one of them to zero or one.
 *
 * The unit comes from `Intl` rather than a `${n}s` template, so Arabic gets
 * "ث" and English gets "s" without this file knowing either. A hardcoded Latin
 * suffix is exactly the kind of thing that survives translation review because
 * it is not in a message file.
 */
export function formatDuration(locale: Locale, ms: number | null): string | null {
  if (ms === null) return null;

  return formatNumber(locale, ms / 1000, {
    style: 'unit',
    unit: 'second',
    unitDisplay: 'narrow',
    maximumFractionDigits: 1,
  });
}

/**
 * The share of runs that failed, as a fraction ready for `formatPercent`.
 *
 * Zero runs is zero rather than a division by zero — a clinic that has never
 * called a model has not got a failure rate, and the screen shows a dash for it
 * on the strength of the run count rather than on anything this returns.
 */
export function failureRate(runs: number, failed: number): number {
  return runs === 0 ? 0 : failed / runs;
}
