import { describe, expect, it } from 'bun:test';

import fixture from './fixtures/tanita-mc780-metric.json';
import { parseReport, validateReport } from './report';
import { matchesTanitaMc780, parseTanitaMc780, readMeasuredAt } from './tanita-mc780';
import { readHeightCm, readQuantity, toKilocalories, toKilograms } from './units';
import { type ExtractedPage, type ParsedReport } from './types';

/**
 * Read against a real Tanita MC-780 sheet from the clinic, with the subject's
 * name and machine number replaced. Every figure below is what the machine
 * actually printed — that is the point of the fixture, and why it is checked in
 * rather than hand-written: a template located by coordinates can only be
 * trusted against a page that really came off the device.
 */
const page = fixture as ExtractedPage;

function shifted(page: ExtractedPage, dy: number): ExtractedPage {
  return { ...page, items: page.items.map((item) => ({ ...item, y: item.y + dy })) };
}

describe('units', () => {
  it('reads a figure and its unit', () => {
    expect(readQuantity('72.2 kg')).toMatchObject({ value: 72.2, unit: 'kg' });
    expect(readQuantity('38.40 %')).toMatchObject({ value: 38.4, unit: '%' });
    expect(readQuantity('29.30')).toMatchObject({ value: 29.3, unit: '' });
  });

  it('refuses a dash, which is what the machine prints where it measured nothing', () => {
    // The whole null-not-zero rule starts here. A dash read as 0 would record a
    // client with no body fat.
    expect(readQuantity('-')).toBeNull();
    expect(readQuantity('')).toBeNull();
  });

  it('converts pounds, because the unit is a device setting and not a model', () => {
    const pounds = readQuantity('173.39 lb')!;
    const converted = toKilograms(pounds)!;
    expect(converted.kg).toBeCloseTo(78.65, 2);
    expect(converted.converted).toBe(true);
  });

  it('leaves kilograms alone and marks them unconverted', () => {
    expect(toKilograms(readQuantity('72.2 kg')!)).toEqual({ kg: 72.2, converted: false });
  });

  it('reads both height forms the machine can print', () => {
    expect(readHeightCm('157 cm')).toMatchObject({ cm: 157, converted: false });
    // The manufacturer's own sample sheet prints this.
    expect(readHeightCm('5 10.08 ft_in')!.cm).toBeCloseTo(178.0, 1);
    expect(readHeightCm('5 10.08 ft_in')!.converted).toBe(true);
  });

  it('converts kilojoules to kilocalories', () => {
    expect(toKilocalories(readQuantity('6050 kJ')!)!.kcal).toBeCloseTo(1446, 0);
  });
});

describe('matchesTanitaMc780', () => {
  it('recognises a real sheet', () => {
    expect(matchesTanitaMc780(page)).toBe(true);
  });

  it('does not recognise a page whose figures are somewhere else', () => {
    expect(matchesTanitaMc780(shifted(page, 40))).toBe(false);
  });

  it('does not recognise a page of a different size', () => {
    expect(matchesTanitaMc780({ ...page, width: 612, height: 1008 })).toBe(false);
  });

  it('does not recognise an empty page', () => {
    expect(matchesTanitaMc780({ ...page, items: [], plainText: '' })).toBe(false);
  });
});

describe('parseTanitaMc780', () => {
  const report = parseTanitaMc780(page);
  const value = (figure: keyof ParsedReport['figures']) => report.figures[figure].value;

  it('reads every figure the Details table carries', () => {
    expect(value('weightKg')).toBeCloseTo(72.2, 2);
    expect(value('bodyFatPercent')).toBeCloseTo(38.4, 2);
    expect(value('fatMassKg')).toBeCloseTo(27.72, 2);
    expect(value('fatFreeMassKg')).toBeCloseTo(44.48, 2);
    expect(value('muscleMassKg')).toBeCloseTo(42.2, 2);
    expect(value('metabolicAge')).toBe(33);
  });

  it('reads the panels beside the body diagram', () => {
    expect(value('heightCm')).toBeCloseTo(157, 1);
    expect(value('boneMassKg')).toBeCloseTo(2.3, 2);
    expect(value('totalBodyWaterKg')).toBeCloseTo(32.92, 2);
    expect(value('totalBodyWaterPercent')).toBeCloseTo(45.6, 2);
    expect(value('visceralFatRating')).toBeCloseTo(4.5, 1);
    expect(value('basalMetabolicRateKcal')).toBe(1446);
  });

  it('marks a metric sheet as read rather than converted', () => {
    expect(report.figures.weightKg.origin).toBe('read');
    expect(report.figures.heightCm.origin).toBe('read');
    expect(report.warnings.filter((w) => w.kind === 'converted')).toEqual([]);
  });

  it('keeps the raw text so the confirm screen can show its working', () => {
    expect(report.figures.weightKg.raw).toBe('72.2 kg');
    expect(report.figures.heightCm.raw).toBe('157 cm');
  });

  it('carries the subject through for checking it is the right client', () => {
    expect(report.subjectName).toBe('test subject');
    expect(report.subjectId).toBe('10000001');
  });

  it('names the machine and the parser that read it', () => {
    expect(report.device).toBe('Tanita MC-780');
    // Stored on the row, so a better template can re-read the file later.
    expect(report.parserVersion).toBe('tanita/mc-780@1');
  });

  it('keeps what has no column, rather than discarding half a clinical record', () => {
    expect(report.rawValues.printedBmi).toBeCloseTo(29.3, 2);
    expect(report.rawValues.proteinKg).toBeCloseTo(9.28, 2);
    expect(report.rawValues.printedAge).toBe(18);

    const segmental = report.rawValues.segmental as Record<string, number>;
    expect(segmental.muscleTrunk).toBeCloseTo(24.2, 1);
    expect(segmental.fatTrunk).toBeCloseTo(34.3, 1);
    // The five muscle segments should add up to the muscle mass on the table.
    const limbs =
      segmental.muscleTrunk! +
      segmental.muscleLeftArm! +
      segmental.muscleRightArm! +
      segmental.muscleLeftLeg! +
      segmental.muscleRightLeg!;
    expect(limbs).toBeCloseTo(42.2, 0);
  });

  it('leaves a figure the sheet did not carry as null, never zero', () => {
    // Waist and hip come off a tape measure; no analyser reports them.
    expect(report.figures).not.toHaveProperty('waistCm');
  });
});

describe('the date', () => {
  it('settles the day from the History line rather than the ambiguous header', () => {
    // The header prints `26/8/2026 13:11` and the History block `26.08.2026`.
    const when = readMeasuredAt(page);
    expect(when.measuredOn).toBe('2026-08-26');
    expect(when.measuredAtMinute).toBe(13 * 60 + 11);
    expect(when.ambiguousRaw).toBeNull();
  });

  it('flags a header date that could be read two ways when nothing settles it', () => {
    // `12/3/2026` is March in one configuration and December in another, and
    // filing a visit nine months out would misplace it in every chart.
    const withoutHistory: ExtractedPage = {
      ...page,
      items: page.items
        .filter((item) => !/^\d{2}\.\d{2}\.\d{4}$/.test(item.text))
        .map((item) => (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(item.text) ? { ...item, text: '12/3/2026 13:11' } : item)),
    };

    const when = readMeasuredAt(withoutHistory);
    expect(when.ambiguousRaw).toBe('12/3/2026 13:11');
  });

  it('does not flag a header date only one reading can explain', () => {
    const withoutHistory: ExtractedPage = {
      ...page,
      items: page.items.filter((item) => !/^\d{2}\.\d{2}\.\d{4}$/.test(item.text)),
    };

    // `26/8` cannot be the 8th of month 26.
    expect(readMeasuredAt(withoutHistory).ambiguousRaw).toBeNull();
    expect(readMeasuredAt(withoutHistory).measuredOn).toBe('2026-08-26');
  });
});

describe('validateReport', () => {
  it('finds nothing wrong with a real sheet read correctly', () => {
    expect(validateReport(parseTanitaMc780(page))).toEqual([]);
  });

  it('catches a figure that disagrees with the ones around it', () => {
    /*
      The failure this whole check exists for. Fields are found by position
      because the labels are images, so a shifted template returns the
      *neighbouring* value — every figure plausible, nothing complaining. Here
      fat mass is replaced by the fat-free mass sitting one row below it.
    */
    const report = parseTanitaMc780(page);
    report.figures.fatMassKg = { value: 44.48, origin: 'read', raw: '44.48 kg' };

    const warnings = validateReport(report);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.map((w) => (w.kind === 'checksum' ? w.check : ''))).toContain(
      'fatMass = weight x fat%',
    );
  });

  it('reports the BMI gap that means a height was typed in wrong', () => {
    const report = parseTanitaMc780(page);
    // The machine was told 157 cm; suppose the record says 165.
    report.figures.heightCm = { value: 165, origin: 'read', raw: '165 cm' };

    const warnings = validateReport(report);
    expect(warnings.some((w) => w.kind === 'checksum' && w.check.startsWith('bmi'))).toBe(true);
  });

  it('asks nothing it lacks the figures to ask', () => {
    const report = parseTanitaMc780(page);
    report.figures.bodyFatPercent = { value: null, origin: 'missing', raw: null };
    report.figures.totalBodyWaterPercent = { value: null, origin: 'missing', raw: null };

    // The remaining checks still hold, and the two that cannot run are skipped
    // rather than failing against a null.
    expect(validateReport(report)).toEqual([]);
  });
});

describe('parseReport', () => {
  it('reads a recognised sheet and validates it in one pass', () => {
    const report = parseReport(page);
    expect(report.device).toBe('Tanita MC-780');
    expect(report.figures.weightKg.value).toBeCloseTo(72.2, 2);
    expect(report.warnings).toEqual([]);
  });

  it('hands back an empty draft for a machine no template knows', () => {
    // Not an error and never a block: the confirm screen opens with nothing
    // filled in, the PDF is still attached, and the dietitian types the figures.
    // Guessing here would be asking someone to check work that was never done.
    const report = parseReport(shifted(page, 40));

    expect(report.device).toBeNull();
    expect(report.parserVersion).toBeNull();
    expect(report.warnings).toEqual([{ kind: 'unknownDevice' }]);
    expect(Object.values(report.figures).every((figure) => figure.value === null)).toBe(true);
  });
});
