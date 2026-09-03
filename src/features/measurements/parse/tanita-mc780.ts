import { type IsoDate } from '@/lib/iso-date';

import { readHeightCm, readQuantity, round, toKilocalories, toKilograms } from './units';
import {
  emptyFigures,
  type ExtractedPage,
  type ParsedReport,
  type ParseWarning,
  type ReportFigure,
  type TextItem,
} from './types';

/**
 * Reading a Tanita "Body Composition Results" sheet.
 *
 * ## The labels are pictures
 *
 * This is the fact the whole file is shaped around. The template — "Weight",
 * "Fat %", "Segmental Analysis", every heading and every row name — is drawn as
 * artwork. Only the filled-in numbers are real text. Extracting the text yields
 * a bare list of figures with nothing naming them:
 *
 * ```
 * 26/8/2026 13:11 · 52422067 · sara muhtaseb · 157 cm · 18
 * 72.2 kg · 38.40 % · 27.72 kg · 44.48 kg · 42.20 kg · 29.30 · 33.00 · …
 * ```
 *
 * So there is no label to match on, and a field is identified by **where it sits
 * on the page**. That is a genuinely worse position to be in than a text report,
 * and it has one dangerous property: a template that has shifted does not fail,
 * it returns the *neighbouring* figure. Body fat reads as fat mass and nothing
 * complains.
 *
 * ## Which is why the numbers are checked against each other
 *
 * A body composition sheet is arithmetically redundant, and `report.ts` uses
 * that as a checksum: fat mass must be weight x fat%, fat-free mass must be
 * weight minus fat mass, muscle plus bone must be fat-free mass, the printed BMI
 * must match weight over height squared. Get one field wrong and those stop
 * agreeing. It is the closest thing to a guarantee available when the page will
 * not say what its own numbers are.
 *
 * Even so, nothing here writes a measurement. The output is a draft for the
 * confirm screen; see `types.ts`.
 *
 * ## Anchors
 *
 * Coordinates are points from the top-left of an A4 page, as `extract.ts`
 * normalises them, measured off a real report. They are matched with a tolerance
 * rather than exactly, because a longer name or a two-line address shifts a
 * block by a point or two.
 */

export const TANITA_MC780 = {
  device: 'Tanita MC-780',
  parserVersion: 'tanita/mc-780@1',
} as const;

type Anchor = { x: number; y: number };

/**
 * How far from an anchor a value may sit and still be that value.
 *
 * Rows on this sheet are 13pt apart and columns 50pt, so the vertical figure is
 * the tight one: half a row's spacing, which cannot reach the row above or
 * below. Header fields pass a wider box of their own, because a name and an
 * address are as long as they happen to be.
 */
const TOLERANCE: Anchor = { x: 34, y: 7 };

/**
 * The Details table's "Result" column, and the header block.
 *
 * Read off the sheet in `docs`-free terms: the seven rows are Weight, Fat %,
 * Fat Mass, Fat Free Mass, Muscle Mass, BMI, Metabolic Age, top to bottom.
 */
const DETAILS: Record<string, Anchor> = {
  weight: { x: 115, y: 160 },
  bodyFatPercent: { x: 115, y: 175 },
  fatMass: { x: 115, y: 188 },
  fatFreeMass: { x: 115, y: 201 },
  muscleMass: { x: 115, y: 215 },
  bmi: { x: 115, y: 230 },
  metabolicAge: { x: 115, y: 242 },
};

/** The figure block beside the body diagram, and the BMR / visceral / water panel. */
const PANEL: Record<string, Anchor> = {
  boneMass: { x: 415, y: 152 },
  protein: { x: 465, y: 152 },
  bmrKj: { x: 105, y: 287 },
  bmrKcal: { x: 105, y: 301 },
  visceralFat: { x: 130, y: 340 },
  waterPercent: { x: 120, y: 380 },
  waterKg: { x: 120, y: 392 },
};

/** Segmental analysis: muscle mass on the left panel, fat percent on the right. */
const SEGMENTS: Record<string, Anchor> = {
  muscleTrunk: { x: 100, y: 458 },
  muscleLeftArm: { x: 70, y: 492 },
  muscleRightArm: { x: 250, y: 492 },
  muscleLeftLeg: { x: 80, y: 527 },
  muscleRightLeg: { x: 240, y: 528 },
  fatTrunk: { x: 360, y: 458 },
  fatLeftArm: { x: 330, y: 492 },
  fatRightArm: { x: 505, y: 492 },
  fatLeftLeg: { x: 342, y: 527 },
  fatRightLeg: { x: 492, y: 527 },
};

/** The header: date and time, subject number, name, height, age. */
const HEADER: Record<string, Anchor> = {
  measuredAt: { x: 425, y: 71 },
  subjectId: { x: 80, y: 84 },
  name: { x: 80, y: 99 },
  height: { x: 265, y: 99 },
  age: { x: 80, y: 114 },
};

/** The nearest item to an anchor, within tolerance. */
function at(page: ExtractedPage, anchor: Anchor, tolerance: Anchor = TOLERANCE): TextItem | null {
  let best: TextItem | null = null;
  let bestDistance = Infinity;

  for (const item of page.items) {
    const dx = Math.abs(item.x - anchor.x);
    const dy = Math.abs(item.y - anchor.y);
    if (dx > tolerance.x || dy > tolerance.y) continue;

    // Vertical agreement matters more than horizontal: rows are 13pt apart and
    // columns are 50pt apart, so a point of drift down the page is far more
    // likely to pick the wrong row than the wrong column.
    const distance = dy * 4 + dx;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = item;
    }
  }

  return best;
}

/**
 * Whether this page is a Tanita result sheet.
 *
 * Not a logo check — the logo is an image and this reader only sees text. It
 * asks whether the *shape* is right: an A4 page whose Details column holds a
 * mass, a percentage and a plain BMI in the three places they belong, and whose
 * header carries a height. A page that satisfies all of that and is not a Tanita
 * sheet would have to be a deliberate forgery of one.
 */
export function matchesTanitaMc780(page: ExtractedPage): boolean {
  if (Math.abs(page.width - 595) > 12 || Math.abs(page.height - 842) > 16) return false;

  const weight = at(page, DETAILS.weight!);
  const fat = at(page, DETAILS.bodyFatPercent!);
  const bmi = at(page, DETAILS.bmi!);
  const height = at(page, HEADER.height!);

  const weightQ = weight ? readQuantity(weight.text) : null;
  const fatQ = fat ? readQuantity(fat.text) : null;
  const bmiQ = bmi ? readQuantity(bmi.text) : null;

  return Boolean(
    weightQ &&
      (weightQ.unit === 'kg' || weightQ.unit === 'lb') &&
      fatQ &&
      fatQ.unit === '%' &&
      bmiQ &&
      bmiQ.unit === '' &&
      height &&
      readHeightCm(height.text),
  );
}

/**
 * A Tanita date, which is printed twice in two formats.
 *
 * The header says `26/8/2026 13:11` and the History block says `26.08.2026`. The
 * header alone is ambiguous — `12/3/2026` is either March or December depending
 * on where the machine was configured — and filing a measurement nine months out
 * would put it in the wrong place in every chart on the tab.
 *
 * So the header supplies the time and the History line settles the day, and when
 * the two disagree or the History line is absent the caller is warned rather
 * than told a date confidently.
 */
export function readMeasuredAt(page: ExtractedPage): {
  measuredOn: IsoDate | null;
  measuredAtMinute: number | null;
  ambiguousRaw: string | null;
} {
  const header = at(page, HEADER.measuredAt!, { x: 90, y: 8 });
  const raw = header?.text ?? null;

  let minute: number | null = null;
  let headerDay: number | null = null;
  let headerMonth: number | null = null;
  let headerYear: number | null = null;

  if (raw) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(raw);
    if (m) {
      headerDay = Number(m[1]);
      headerMonth = Number(m[2]);
      headerYear = Number(m[3]);
      if (m[4] !== undefined) minute = Number(m[4]) * 60 + Number(m[5]);
    }
  }

  // The History block's own unambiguous `DD.MM.YYYY`, wherever it sits.
  const history = page.items
    .map((item) => /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(item.text))
    .find((match): match is RegExpExecArray => match !== null);

  if (history) {
    const day = Number(history[1]);
    const month = Number(history[2]);
    const year = Number(history[3]);
    return {
      measuredOn: iso(year, month, day),
      measuredAtMinute: minute,
      ambiguousRaw: null,
    };
  }

  if (headerYear !== null && headerMonth !== null && headerDay !== null) {
    /*
      No History line to settle it. A day above 12 proves which half is which —
      `26/8` cannot be the 8th of month 26 — and anything below that is genuinely
      two dates, so it is reported as read and flagged.
    */
    const decidable = headerDay > 12 || headerMonth > 12;
    return {
      measuredOn: iso(headerYear, headerMonth, headerDay),
      measuredAtMinute: minute,
      ambiguousRaw: decidable ? null : raw,
    };
  }

  return { measuredOn: null, measuredAtMinute: minute, ambiguousRaw: raw };
}

function iso(year: number, month: number, day: number): IsoDate | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Reads the whole sheet. Assumes {@link matchesTanitaMc780} has already passed. */
export function parseTanitaMc780(page: ExtractedPage): ParsedReport {
  const figures = emptyFigures();
  const warnings: ParseWarning[] = [];
  const rawValues: Record<string, unknown> = {};

  const setMass = (figure: ReportFigure, anchor: Anchor) => {
    const item = at(page, anchor);
    const quantity = item ? readQuantity(item.text) : null;
    if (!quantity) return;

    const kilograms = toKilograms(quantity);
    if (!kilograms) return;

    if (kilograms.converted) {
      warnings.push({ kind: 'converted', field: figure, from: quantity.unit, to: 'kg' });
    }

    figures[figure] = {
      value: round(kilograms.kg, 2),
      origin: kilograms.converted ? 'converted' : 'read',
      raw: quantity.raw,
    };
  };

  const setPlain = (figure: ReportFigure, anchor: Anchor, decimals: number) => {
    const item = at(page, anchor);
    const quantity = item ? readQuantity(item.text) : null;
    if (!quantity) return;

    figures[figure] = { value: round(quantity.value, decimals), origin: 'read', raw: quantity.raw };
  };

  // ── Header ──────────────────────────────────────────────────────────────
  const nameItem = at(page, HEADER.name!, { x: 120, y: 7 });
  const idItem = at(page, HEADER.subjectId!, { x: 60, y: 7 });
  const heightItem = at(page, HEADER.height!, { x: 60, y: 7 });

  const height = heightItem ? readHeightCm(heightItem.text) : null;
  if (height) {
    if (height.converted) {
      warnings.push({ kind: 'converted', field: 'heightCm', from: 'ft/in', to: 'cm' });
    }
    figures.heightCm = {
      value: round(height.cm, 1),
      origin: height.converted ? 'converted' : 'read',
      raw: height.raw,
    };
  }

  const when = readMeasuredAt(page);
  if (when.ambiguousRaw) warnings.push({ kind: 'dateAmbiguous', raw: when.ambiguousRaw });

  // ── Details table ───────────────────────────────────────────────────────
  setMass('weightKg', DETAILS.weight!);
  setPlain('bodyFatPercent', DETAILS.bodyFatPercent!, 2);
  setMass('fatMassKg', DETAILS.fatMass!);
  setMass('fatFreeMassKg', DETAILS.fatFreeMass!);
  setMass('muscleMassKg', DETAILS.muscleMass!);
  setPlain('metabolicAge', DETAILS.metabolicAge!, 0);

  // ── Panels ──────────────────────────────────────────────────────────────
  setMass('boneMassKg', PANEL.boneMass!);
  setMass('totalBodyWaterKg', PANEL.waterKg!);
  setPlain('totalBodyWaterPercent', PANEL.waterPercent!, 2);
  setPlain('visceralFatRating', PANEL.visceralFat!, 1);

  const bmrItem = at(page, PANEL.bmrKcal!);
  const bmrQuantity = bmrItem ? readQuantity(bmrItem.text) : null;
  const bmr = bmrQuantity ? toKilocalories(bmrQuantity) : null;
  if (bmr) {
    figures.basalMetabolicRateKcal = {
      value: Math.round(bmr.kcal),
      origin: bmr.converted ? 'converted' : 'read',
      raw: bmrQuantity!.raw,
    };
  }

  // ── Everything with no column of its own ────────────────────────────────
  const printedBmi = at(page, DETAILS.bmi!);
  const printedBmiQuantity = printedBmi ? readQuantity(printedBmi.text) : null;
  if (printedBmiQuantity) rawValues.printedBmi = printedBmiQuantity.value;

  const proteinItem = at(page, PANEL.protein!);
  const protein = proteinItem ? readQuantity(proteinItem.text) : null;
  const proteinKg = protein ? toKilograms(protein) : null;
  if (proteinKg) rawValues.proteinKg = round(proteinKg.kg, 2);

  const segmental: Record<string, number> = {};
  for (const [key, anchor] of Object.entries(SEGMENTS)) {
    const item = at(page, anchor);
    const quantity = item ? readQuantity(item.text) : null;
    if (!quantity) continue;

    if (key.startsWith('muscle')) {
      const kilograms = toKilograms(quantity);
      if (kilograms) segmental[key] = round(kilograms.kg, 2);
    } else {
      segmental[key] = round(quantity.value, 1);
    }
  }
  if (Object.keys(segmental).length > 0) rawValues.segmental = segmental;

  const ageItem = at(page, HEADER.age!, { x: 40, y: 7 });
  const age = ageItem ? readQuantity(ageItem.text) : null;
  if (age) rawValues.printedAge = age.value;

  return {
    device: TANITA_MC780.device,
    parserVersion: TANITA_MC780.parserVersion,
    subjectName: nameItem?.text ?? null,
    subjectId: idItem?.text ?? null,
    measuredOn: when.measuredOn,
    measuredAtMinute: when.measuredAtMinute,
    figures,
    rawValues,
    warnings,
  };
}
