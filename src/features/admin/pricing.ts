/**
 * What a model costs, so the platform screen can turn tokens into money.
 *
 * ## Why this is a table someone edits, and not a lookup
 *
 * There is no API that tells us what a call cost. The provider bills monthly
 * against published rates, and `weekly_plan_generations` stores the token counts
 * but no price — correctly, because a price is a fact about the day the call was
 * made and freezing the wrong one into every row would be worse than storing
 * none. So the rates live here, in one reviewable place, and the operator keeps
 * them current.
 *
 * ## An unrated model shows tokens and no cost
 *
 * `rateFor` returns `null` rather than guessing, and every figure downstream
 * carries that null through to the screen, which prints a dash and says how many
 * runs it could not price. **Do not add a default rate to make the column look
 * full.** A made-up number in a cost report is worse than an admitted gap: the
 * gap prompts someone to fill this table in, and the guess never gets corrected
 * because nothing looks wrong.
 */

export type ModelRate = {
  /** US dollars per 1,000,000 prompt (input) tokens. */
  inputPerMillionUsd: number;
  /** US dollars per 1,000,000 completion (output) tokens. */
  outputPerMillionUsd: number;
};

/**
 * Rates by model name, matched as a PREFIX — see `rateFor`.
 *
 * Keep the keys as the provider writes them. `console` is the local stand-in
 * transport in `src/features/weekly-plans/llm.ts`; it reaches no network, so it
 * is genuinely free rather than unrated, and saying so keeps development runs
 * out of the "could not price" count.
 *
 * Everything else this deployment actually uses has to be added by hand. The
 * planning model is chosen by `OPENAI_MODEL` and the reviewing model by
 * `OPENAI_REVIEW_MODEL`, so those two are the ones worth checking first.
 */
export const MODEL_RATES: Record<string, ModelRate> = {
  console: { inputPerMillionUsd: 0, outputPerMillionUsd: 0 },
  'gpt-4o-mini': { inputPerMillionUsd: 0.15, outputPerMillionUsd: 0.6 },
};

/**
 * The rate for a model name as the provider returned it, or `null`.
 *
 * **Longest matching prefix, not an exact lookup.** The stored name is whatever
 * came back in the response body, and OpenAI resolves an alias to a dated
 * snapshot on the way out: ask for `gpt-4o-mini` and the reply says
 * `gpt-4o-mini-2024-07-18`. An exact match would therefore price almost nothing
 * in production while passing every test written against the alias.
 *
 * Longest wins so that a more specific entry beats a family one — with both
 * `gpt-4o` and `gpt-4o-mini` in the table, `gpt-4o-mini-2024-07-18` must not be
 * billed at the larger model's rate.
 */
export function rateFor(model: string): ModelRate | null {
  const name = model.trim().toLowerCase();
  if (!name) return null;

  let best: { key: string; rate: ModelRate } | null = null;

  for (const [key, rate] of Object.entries(MODEL_RATES)) {
    if (!name.startsWith(key)) continue;
    if (!best || key.length > best.key.length) best = { key, rate };
  }

  return best?.rate ?? null;
}

/**
 * What one call cost, in MICRO-dollars — millionths of a US dollar.
 *
 * Integer minor units, for the reason `src/features/billing/money.ts` gives at
 * length: a column of floats does not add up to the same number twice. Dollars
 * are far too coarse a unit here — a single plan costs a fraction of a cent — so
 * the unit is a millionth, which also makes the arithmetic fall out exactly:
 * a rate is dollars per million tokens, so `tokens × rate` IS micro-dollars,
 * with no scaling factor to get backwards.
 *
 * Returns `null` when the model has no rate. A null token count is read as zero
 * — the provider did not report it, which happens on a failed call and on the
 * local stand-in — so an unmeasured half never invents a cost.
 */
export function costMicroUsd(
  model: string,
  promptTokens: number | null,
  completionTokens: number | null,
): number | null {
  const rate = rateFor(model);
  if (!rate) return null;

  return Math.round(
    (promptTokens ?? 0) * rate.inputPerMillionUsd + (completionTokens ?? 0) * rate.outputPerMillionUsd,
  );
}

/** Micro-dollars as an ordinary dollar amount, for formatting. */
export function microUsdToUsd(microUsd: number): number {
  return microUsd / 1_000_000;
}
