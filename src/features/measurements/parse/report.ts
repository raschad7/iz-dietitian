import { bmi } from '@/features/weekly-plans/targets';

import { matchesTanitaMc780, parseTanitaMc780 } from './tanita-mc780';
import { emptyFigures, type ExtractedPage, type ParsedReport, type ParseWarning } from './types';

/**
 * Picking a template, running it, and checking what it produced.
 *
 * ## Adding a machine is adding a row here
 *
 * The registry is the whole extension point. A new clinic's analyser needs a
 * `matches` that recognises its sheet and a `parse` that reads it; every screen,
 * every warning and the confirm flow are already written and do not change. That
 * was the design constraint from the start — the second customer has a different
 * machine, and a parser per customer that costs a sprint is a parser that gets
 * skipped.
 *
 * Templates are tried in order and the first match wins.
 */
const DEVICES = [
  { matches: matchesTanitaMc780, parse: parseTanitaMc780 },
] as const;

/**
 * A report from a machine no template recognises.
 *
 * **It is not an error, and it must never block the clinic.** The confirm screen
 * opens with nothing filled in and a warning saying so, which leaves the
 * dietitian typing the figures by hand from a PDF that is already attached to
 * the record — no worse than the manual entry they would otherwise use, and one
 * click closer.
 *
 * Guessing would be worse than nothing here. Without a template there is no
 * label to match on (a Tanita's are images, and other makes are no better), so
 * anything filled in would be a figure taken from wherever a number happened to
 * sit — and the confirm screen would then be asking someone to check work that
 * was never done.
 */
function unrecognised(): ParsedReport {
  return {
    device: null,
    parserVersion: null,
    subjectName: null,
    subjectId: null,
    measuredOn: null,
    measuredAtMinute: null,
    figures: emptyFigures(),
    rawValues: {},
    warnings: [{ kind: 'unknownDevice' }],
  };
}

/**
 * The arithmetic a body composition sheet has to satisfy.
 *
 * ## Why this exists
 *
 * Fields are found by position, because the labels on these sheets are pictures.
 * Position has a failure mode that a label lookup does not: a template that is
 * off by one row does not fail, it silently returns the *neighbouring* figure.
 * Body fat is read as fat mass, every value is plausible, and nothing anywhere
 * says so.
 *
 * These sheets are arithmetically redundant, and that redundancy is the only
 * independent check available. Get one field wrong and the equations stop
 * agreeing. It does not prove a reading is right; it catches the class of
 * mistake this parser is most likely to make and least able to notice.
 *
 * Each tolerance is what rounding alone can explain — the sheet prints two
 * decimals and derives its own figures from unrounded ones.
 */
const CHECKS: {
  name: string;
  /** Both sides, or null when the report did not carry enough to ask. */
  compute: (figures: ParsedReport['figures']) => { expected: number; found: number } | null;
  tolerance: number;
}[] = [
  {
    name: 'fatMass = weight x fat%',
    tolerance: 0.15,
    compute: ({ weightKg, bodyFatPercent, fatMassKg }) =>
      weightKg.value !== null && bodyFatPercent.value !== null && fatMassKg.value !== null
        ? { expected: (weightKg.value * bodyFatPercent.value) / 100, found: fatMassKg.value }
        : null,
  },
  {
    name: 'fatFreeMass = weight - fatMass',
    tolerance: 0.15,
    compute: ({ weightKg, fatMassKg, fatFreeMassKg }) =>
      weightKg.value !== null && fatMassKg.value !== null && fatFreeMassKg.value !== null
        ? { expected: weightKg.value - fatMassKg.value, found: fatFreeMassKg.value }
        : null,
  },
  {
    name: 'fatFreeMass = muscle + bone',
    // Looser: the sheet rounds muscle and bone to two decimals independently,
    // and on a real report the two sides land about 0.02 kg apart.
    tolerance: 0.25,
    compute: ({ muscleMassKg, boneMassKg, fatFreeMassKg }) =>
      muscleMassKg.value !== null && boneMassKg.value !== null && fatFreeMassKg.value !== null
        ? { expected: muscleMassKg.value + boneMassKg.value, found: fatFreeMassKg.value }
        : null,
  },
  {
    name: 'bodyWater = weight x water%',
    tolerance: 0.2,
    compute: ({ weightKg, totalBodyWaterPercent, totalBodyWaterKg }) =>
      weightKg.value !== null &&
      totalBodyWaterPercent.value !== null &&
      totalBodyWaterKg.value !== null
        ? {
            expected: (weightKg.value * totalBodyWaterPercent.value) / 100,
            found: totalBodyWaterKg.value,
          }
        : null,
  },
];

/**
 * Compares our BMI with the one the sheet printed.
 *
 * A gap means the height the machine was given differs from the height it was
 * read at — normally an operator typo, and the cheapest error detector this
 * feature has. Kept separate from `CHECKS` because it is checking the *height*,
 * not the parser.
 */
function bmiCheck(report: ParsedReport): ParseWarning | null {
  const printed = report.rawValues.printedBmi;
  if (typeof printed !== 'number') return null;

  const ours = bmi(report.figures.weightKg.value, report.figures.heightCm.value);
  if (ours === null) return null;

  return Math.abs(ours - printed) > 0.2
    ? { kind: 'checksum', check: 'bmi = weight / height^2', expected: printed, found: ours }
    : null;
}

/** Runs every check that this report carries enough figures to ask. */
export function validateReport(report: ParsedReport): ParseWarning[] {
  const warnings: ParseWarning[] = [];

  for (const check of CHECKS) {
    const result = check.compute(report.figures);
    if (!result) continue;

    if (Math.abs(result.expected - result.found) > check.tolerance) {
      warnings.push({
        kind: 'checksum',
        check: check.name,
        expected: Number(result.expected.toFixed(2)),
        found: Number(result.found.toFixed(2)),
      });
    }
  }

  const bmiWarning = bmiCheck(report);
  if (bmiWarning) warnings.push(bmiWarning);

  return warnings;
}

/**
 * The whole read: pick a template, run it, check the result.
 *
 * Pure over an already-extracted page, so the templates and the checks can be
 * tested against a fixture without a PDF or a filesystem — `extract.ts` is the
 * only part that needs either.
 */
export function parseReport(page: ExtractedPage): ParsedReport {
  const device = DEVICES.find((candidate) => candidate.matches(page));
  if (!device) return unrecognised();

  const report = device.parse(page);

  return { ...report, warnings: [...report.warnings, ...validateReport(report)] };
}
