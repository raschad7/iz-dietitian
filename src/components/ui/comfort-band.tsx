import { cn } from '@/lib/utils';

/**
 * Geometry for `ComfortBand`, as percentages of the track (0–100). Callers
 * spread a computed geometry (e.g. `bandGeometry` in
 * `src/features/weekly-plans/band.ts`) into these props at the call site —
 * this file stays feature-agnostic because `components/ui` is the shared
 * layer and must not import from `features/*`.
 */
export type ComfortBandProps = {
  /** Percent along the track where the tolerance span begins. */
  rangeStart: number;
  /** The tolerance span's width, in percent of the track. */
  rangeWidth: number;
  /** Percent along the track where the value landed. */
  marker: number;
  /** Whether the value missed the tolerance, which recolours the marker. */
  offTarget: boolean;
  /** What this measures — the accessible name. "Sunday's calories against target". */
  label: string;
  /** How the value reads — "2133 of 2000", never the track percentage. */
  valueText: string;
  className?: string;
};

/**
 * A value drawn against a tolerance: a track, a comfortable span, and a
 * marker for where the value landed.
 *
 * Base UI's `Meter` doesn't fit — its `Indicator` is a single fill from one
 * edge, and this needs a span plus a separate marker. Composing two Meters to
 * fake that would be worse than this plain markup with explicit ARIA.
 *
 * `role="meter"` requires `aria-valuenow`; a `aria-valuetext`-only meter is
 * not valid ARIA. `marker` (already 0–100, the position along the track) is
 * the natural `aria-valuenow`. `aria-label` and `aria-valuetext` are two
 * different things, not one string reused: `aria-label` computes the
 * accessible NAME (what this measures), `aria-valuetext` overrides how the
 * VALUE is announced (the real reading) — most screen readers announce name
 * then value, so `label` and `valueText` have to stay distinct or the same
 * string is heard twice. `aria-valuetext` still wins over `aria-valuenow`
 * for the announced value, so a screen reader hears "2133 of 2000", not the
 * "85" track percentage.
 *
 * The geometry is `aria-hidden`; every value must be readable without it,
 * which is why `valueText` carries the real numbers.
 *
 * Percentages are inline-start offsets, so the band mirrors in Arabic with no
 * override — see "RTL" in docs/design-system.md.
 */
export function ComfortBand({
  rangeStart,
  rangeWidth,
  marker,
  offTarget,
  label,
  valueText,
  className,
}: ComfortBandProps) {
  return (
    <div
      role="meter"
      aria-valuenow={marker}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={valueText}
      aria-label={label}
      className={cn('relative h-1.5 rounded-full bg-muted', className)}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 border-s border-e border-viz-band-edge bg-viz-band-range"
        style={{ insetInlineStart: `${rangeStart}%`, width: `${rangeWidth}%` }}
      />

      {/*
       * Extends slightly past the track vertically so it reads as a mark
       * rather than a fill segment — a computed visual detail, not a token,
       * so it's an inline style rather than a utility. Centred on the
       * percentage (calc(...) - half its own width) rather than anchored by
       * its leading edge, so it doesn't overflow the track at marker: 100 —
       * the off-target case, which is also the one most likely to be looked
       * at. This makes it hang 1.5px past the track's start edge at
       * marker: 0, symmetric with the 100 case; that's correct, not a bug.
       */}
      <span
        aria-hidden
        className={cn('absolute w-[3px] rounded-full', offTarget ? 'bg-status-attention-fg' : 'bg-viz-band-marker')}
        style={{
          insetInlineStart: `calc(${marker}% - 1.5px)`,
          insetBlockStart: '-2px',
          insetBlockEnd: '-2px',
        }}
      />
    </div>
  );
}
