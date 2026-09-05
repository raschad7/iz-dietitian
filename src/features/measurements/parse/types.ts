import { type IsoDate } from '@/lib/iso-date';

/**
 * What a body composition report parses into, before a person has looked at it.
 *
 * **Nothing here is a measurement yet.** This is a draft: what the reader found,
 * where each figure came from, and everything that looked wrong about it. A
 * `client_measurements` row is only written after a dietitian has seen this on
 * the confirm screen and pressed Save, which is why `MEASUREMENT_SOURCES` has no
 * value for "read but unreviewed".
 *
 * The reason that rule is not negotiable here: a misread body-fat percentage is
 * a clinical decision made on a typo, and the misreads this parser can make are
 * silent ones — see `tanita-mc780.ts` on why the figures are found by position
 * rather than by label.
 */

/** A figure a report can carry. The subset of `client_measurements` a parser fills. */
export const REPORT_FIGURES = [
  'weightKg',
  'heightCm',
  'bodyFatPercent',
  'fatMassKg',
  'fatFreeMassKg',
  'muscleMassKg',
  'boneMassKg',
  'totalBodyWaterKg',
  'totalBodyWaterPercent',
  'visceralFatRating',
  'basalMetabolicRateKcal',
  'metabolicAge',
] as const;

export type ReportFigure = (typeof REPORT_FIGURES)[number];

/** Where one figure on the confirm screen came from. */
export type FigureOrigin =
  /** Read straight off the report. */
  | 'read'
  /** Converted from the unit the machine printed — the raw text says which. */
  | 'converted'
  /** The report did not carry it. The field opens empty, never zero. */
  | 'missing';

export type ParsedFigure = {
  value: number | null;
  origin: FigureOrigin;
  /** Exactly what was printed, so the confirm screen can show its working. */
  raw: string | null;
};

/**
 * Something about this report that a person has to look at.
 *
 * Warnings never block a save. They are the difference between a parser that is
 * trusted and one that is checked: every one of these is a case where the
 * figures may be right and may be badly wrong, and only the dietitian can tell.
 */
export type ParseWarning =
  /** No template matched. Everything is a guess; check every value. */
  | { kind: 'unknownDevice' }
  /** A figure was printed in a non-metric unit and converted. */
  | { kind: 'converted'; field: ReportFigure; from: string; to: string }
  /**
   * Two figures on the report disagree with each other.
   *
   * The strongest signal this file has. Because fields are located by position,
   * a shifted template assigns the *wrong* value to the right field — and that
   * is invisible unless something checks the numbers against each other. See
   * `CHECKS` in `report.ts`.
   */
  | { kind: 'checksum'; check: string; expected: number; found: number }
  /** The printed date could be read two ways and nothing disambiguated it. */
  | { kind: 'dateAmbiguous'; raw: string };

export type ParsedReport = {
  /** As the template names the machine — `Tanita MC-780`. Null when unrecognised. */
  device: string | null;
  /** `tanita/mc-780@1`. Stored on the measurement so a better parser can re-read it. */
  parserVersion: string | null;

  /** The name printed on the report, for checking it is the right client. */
  subjectName: string | null;
  /** The machine's own subject number. */
  subjectId: string | null;

  measuredOn: IsoDate | null;
  /** Minutes from midnight, or null when the report printed no time. */
  measuredAtMinute: number | null;

  figures: Record<ReportFigure, ParsedFigure>;

  /**
   * Everything the template recognised that has no column — segmental analysis,
   * protein mass, the machine's healthy ranges.
   *
   * Kept because discarding part of a clinical record at parse time is not this
   * feature's decision to make, and because a chart for any of it later becomes
   * a UI change rather than a request that every clinic re-upload a year of PDFs.
   */
  rawValues: Record<string, unknown>;

  warnings: ParseWarning[];
};

/** One piece of text on the page, with where it sits. */
export type TextItem = {
  text: string;
  /** Points from the page's inline-start edge. */
  x: number;
  /** Points from the **top** of the page — flipped from the PDF's own origin. */
  y: number;
};

/** The page a template is matched against. */
export type ExtractedPage = {
  width: number;
  height: number;
  items: TextItem[];
  /** Every item's text joined, kept on the file row so a re-parse need not redo extraction. */
  plainText: string;
};

export function emptyFigures(): Record<ReportFigure, ParsedFigure> {
  return Object.fromEntries(
    REPORT_FIGURES.map((figure) => [figure, { value: null, origin: 'missing', raw: null }]),
  ) as Record<ReportFigure, ParsedFigure>;
}
