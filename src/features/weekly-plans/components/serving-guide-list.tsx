import type { ServingGuideLine } from '../serving-guide';

/**
 * The one or two lines a person actually serves — `أرز مطبوخ: 6 ملاعق كبيرة`,
 * `لحم: 100 غ`.
 *
 * Deliberately **not** a `'use client'` module, like `meal-ingredient-amounts.tsx`
 * beside it: the staff panel is a client component and pulls it into the bundle,
 * the patient portal's card is a server component and keeps it on the server. One
 * implementation so a dietitian and their client read the same sentence.
 *
 * It takes already-rendered strings rather than the guide itself, because
 * choosing the language and inflecting the unit is `serving-guide.ts`'s job and is
 * covered by tests there; this file is layout.
 */
export function ServingGuideList({ lines }: { lines: readonly ServingGuideLine[] }) {
  if (!lines.length) return null;

  return (
    <ul className="flex flex-col gap-1.5 text-body-sm">
      {lines.map((line) => (
        <li key={line.label} className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere] text-muted-foreground" dir="auto">
            {line.label}
          </span>
          {/* `dir="auto"`: the amount leads with a digit, so its direction comes
              from the unit that follows — Arabic or English, in either UI. */}
          <span className="shrink-0 text-end font-medium tabular-nums" dir="auto">
            {line.amount}
          </span>
        </li>
      ))}
    </ul>
  );
}
