import { type ClientMeasurement } from '@/db/schema';
import { type IsoDate } from '@/lib/iso-date';

/**
 * Six weekly visits, newest first — the order `listMeasurements` returns.
 *
 * The figures are internally consistent the way a real sheet is: fat mass is
 * weight times fat percent, fat-free is weight minus fat, muscle plus bone is
 * fat-free, and body water is about 74% of fat-free. Those are the same
 * relations the parser's checksums assert, so a screenshot of this harness is a
 * screenshot of numbers a machine could actually have printed.
 *
 * The 19/8 visit is a 06:34 reading and the 26/8 one is 13:11, which is what
 * makes the clock-drift caveat appear on "since last visit" — a fasted morning
 * measurement against an after-lunch one is exactly the pair a dietitian should
 * read carefully, and exactly the pair a tidy fixture would never contain.
 *
 * The newest visit carries no waist or hip on purpose. That is the null case
 * the whole feature is built around — "not measured" is not zero — and it is
 * the one state a fixture of tidy rows would otherwise never show.
 */
const VISITS = [
  { on: '2026-08-26', at: 791, w: 72.2, fat: 38.4, fatKg: 27.72, ffm: 44.48, muscle: 42.2, water: 32.92, waterPct: 45.6, vis: 4.5, bmr: 1446, age: 33, waist: null, hip: null },
  { on: '2026-08-19', at: 394, w: 73.3, fat: 39.43, fatKg: 28.9, ffm: 44.4, muscle: 42.1, water: 32.86, waterPct: 44.8, vis: 4.5, bmr: 1445, age: 35, waist: 93.0, hip: 108.5 },
  { on: '2026-08-12', at: 610, w: 74.3, fat: 40.31, fatKg: 29.95, ffm: 44.35, muscle: 42.05, water: 32.82, waterPct: 44.2, vis: 5.0, bmr: 1444, age: 36, waist: 94.5, hip: 109.5 },
  { on: '2026-08-05', at: 630, w: 75.1, fat: 41.01, fatKg: 30.8, ffm: 44.3, muscle: 42.0, water: 32.78, waterPct: 43.7, vis: 5.5, bmr: 1443, age: 38, waist: 96.0, hip: 110.5 },
  { on: '2026-07-29', at: 615, w: 75.6, fat: 41.47, fatKg: 31.35, ffm: 44.25, muscle: 41.95, water: 32.75, waterPct: 43.3, vis: 5.5, bmr: 1441, age: 39, waist: 96.5, hip: 111.0 },
  { on: '2026-07-22', at: 620, w: 76.4, fat: 42.15, fatKg: 32.2, ffm: 44.2, muscle: 41.9, water: 32.71, waterPct: 42.8, vis: 6.0, bmr: 1438, age: 40, waist: 98.0, hip: 112.0 },
] as const;

const CLINIC = '00000000-0000-4000-8000-000000000001';
const CLIENT = '00000000-0000-4000-8000-000000000002';

export const FIXTURE_MEASUREMENTS: ClientMeasurement[] = VISITS.map((visit, index) => ({
  id: `fixture-${index}`,
  clinicId: CLINIC,
  clientId: CLIENT,
  measuredOn: visit.on as IsoDate,
  measuredAtMinute: visit.at,
  source: 'device',
  appointmentId: null,
  weightKg: visit.w,
  heightCm: 157,
  bodyFatPercent: visit.fat,
  fatMassKg: visit.fatKg,
  fatFreeMassKg: visit.ffm,
  muscleMassKg: visit.muscle,
  boneMassKg: 2.3,
  totalBodyWaterKg: visit.water,
  totalBodyWaterPercent: visit.waterPct,
  visceralFatRating: visit.vis,
  basalMetabolicRateKcal: visit.bmr,
  metabolicAge: visit.age,
  waistCm: visit.waist,
  hipCm: visit.hip,
  deviceLabel: 'Tanita MC-780',
  deviceSubjectId: '10000001',
  rawValues: null,
  note: null,
  recordedBy: null,
  createdAt: new Date('2026-08-26T10:00:00Z'),
  updatedAt: new Date('2026-08-26T10:00:00Z'),
}));

/** The newest visit has a report behind it; the rest were typed off the screen. */
export const FIXTURE_REPORT_IDS = new Set(['fixture-0']);

export const FIXTURE_CLIENT_ID = CLIENT;
