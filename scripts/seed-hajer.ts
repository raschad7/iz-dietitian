/**
 * Creates one review client — Hajer — and generates her week.
 *
 *   bun --env-file=.env.local run scripts/seed-hajer.ts
 *   bun --env-file=.env.local run scripts/seed-hajer.ts --plan-only
 *
 * ## Why a script and not the forms
 *
 * Everything here goes through the same feature functions the server actions
 * call — `createClient`, `saveIntake`, `createMeasurement`, `runGeneration`,
 * `createPlanFromGeneration`. Nothing is inserted behind their backs, so the
 * record this leaves is the record the dialogs would have left, and the plan is
 * the plan the button would have produced. What it skips is the session guard
 * and twenty minutes of typing.
 *
 * The clinic is resolved from a staff user's email rather than passed in, so the
 * row lands where that dietitian will actually see it.
 */
import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { practitioners, user } from '@/db/schema';
import { createClient, saveIntake } from '@/features/clients/mutations';
import { DEFAULT_MEAL_SCHEDULE } from '@/features/clients/nutrition';
import { createMeasurement } from '@/features/measurements/mutations';
import { runReviewedGeneration, type GenerationOutcome } from '@/features/weekly-plans/generate';
import { createPlanFromGeneration } from '@/features/weekly-plans/mutations';
import {
  getClientContext,
  loadCatalog,
  toPromptCatalog,
  toPromptSides,
} from '@/features/weekly-plans/queries';
import { DAYS_OF_WEEK } from '@/features/weekly-plans/schema';

const OWNER_EMAIL = 'rashad@gmail.com';

/**
 * The general case, and deliberately so: a working mother in her thirties who
 * wants to lose weight, with no diagnosis, no allergy and no prescribed pattern.
 * Every clinical safety net in the planner is switched off for her, which is
 * what makes her the right client to judge the ordinary output on.
 */
const HAJER = {
  firstName: 'هاجر',
  lastName: 'عبد الهادي',
  phone: '+970599417362',
  email: undefined,
  dateOfBirth: '1994-03-15',
  sex: 'female' as const,
};

const INTAKE = {
  heightCm: 162,
  weightKg: 78.4,
  goal: 'weight_loss' as const,
  activityLevel: 'light' as const,

  allergenTags: [] as never[],
  customAllergens: [] as string[],
  clinicalTags: [] as never[],
  dietPattern: undefined,

  allergies: undefined,
  conditions: 'لا يوجد تشخيص. آخر تحاليل قبل شهرين ضمن الطبيعي عدا فيتامين د ٢١ نانوغرام/مل.',
  medications: 'حبوب فيتامين د ٥٠٠٠ وحدة أسبوعياً.',
  medicalNotes:
    'تشتكي من الخمول بعد الغداء ومن الجوع الشديد قبل النوم. سبق أن جربت الصيام المتقطع وحدها ونزلت ٤ كغم ثم استعادتها.',

  preferences: 'تحب الدجاج والزبادي والشوربات. تشرب القهوة العربية يومياً.',
  dislikes: 'لا تحب السمك ولا الكبدة ولا الباذنجان.',
  permanentInstructions: 'الفطور يجب أن يكون سريع التحضير — تخرج للعمل الساعة السابعة والنصف.',

  maritalStatus: 'married' as const,
  childrenCount: 2,
  bloodType: 'o_pos' as const,
  occupation: 'معلمة مرحلة ابتدائية',
  visitReason: 'زيادة الوزن بعد الحمل الثاني ورغبة في النزول قبل الصيف.',
  dietHistory: 'حميات متكررة من الإنترنت، آخرها الصيام المتقطع. لم تلتزم بأي منها أكثر من شهر.',
  drugAllergies: undefined,
  familyHistory: 'سكري من النوع الثاني لدى الوالدة، وضغط لدى الوالد.',

  activityNotes: 'مشي ٢٠ دقيقة ثلاث مرات أسبوعياً. لا تمارس رياضة منظمة.',
  activityBarriers: 'ضيق الوقت بسبب الدوام والأطفال.',
  sleepHours: 6,
  smoking: 'none' as const,

  caffeineFrequency: 'three_four' as const,
  sweetDrinksFrequency: 'one_two' as const,
  fastFoodFrequency: 'one_two' as const,
  vegetablesFrequency: 'one_two' as const,
  fruitFrequency: 'rarely' as const,
  dairyFrequency: 'three_four' as const,
  redMeatFrequency: 'rarely' as const,
  chickenFrequency: 'three_four' as const,
  fishFrequency: 'none' as const,
  sweetsFrequency: 'three_four' as const,

  mealSchedule: DEFAULT_MEAL_SCHEDULE,
};

/** A plausible bio-impedance read for this body, not a set of round numbers. */
const MEASUREMENT = {
  measuredOn: '2026-09-08',
  measuredAtMinute: 9 * 60 + 20,
  weightKg: 78.4,
  heightCm: 162,
  bodyFatPercent: 38.6,
  fatMassKg: 30.3,
  fatFreeMassKg: 48.1,
  muscleMassKg: 45.6,
  boneMassKg: 2.5,
  totalBodyWaterKg: 35.2,
  totalBodyWaterPercent: 44.9,
  visceralFatRating: 9,
  basalMetabolicRateKcal: 1418,
  metabolicAge: 41,
  waistCm: 92,
  hipCm: 110,
  note: 'قياس أول على جهاز الميزان الطبي، صائمة.',
};

async function resolveClinic(): Promise<{ clinicId: string; userId: string }> {
  const [row] = await db
    .select({
      clinicId: practitioners.clinicId,
      // `client_measurements.recorded_by` points at `users`, not `practitioners`.
      userId: user.id,
    })
    .from(practitioners)
    .innerJoin(user, eq(practitioners.userId, user.id))
    .where(eq(user.email, OWNER_EMAIL))
    .limit(1);

  if (!row) throw new Error(`No practitioner found for ${OWNER_EMAIL}.`);
  return row;
}

/** Monday of the coming week, which is what the new-week dialog offers. */
function nextMonday(from = new Date()): string {
  const date = new Date(from);
  date.setDate(date.getDate() + ((8 - date.getDay()) % 7 || 7));
  return date.toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const planOnly = process.argv.includes('--plan-only');
  const { clinicId, userId } = await resolveClinic();
  console.log(`clinic ${clinicId}`);

  let clientId = process.argv[process.argv.indexOf('--client') + 1];

  if (!planOnly || !clientId) {
    const created = await createClient(clinicId, {
      fullName: `${HAJER.firstName} ${HAJER.lastName}`,
      phone: HAJER.phone,
      email: HAJER.email,
      dateOfBirth: HAJER.dateOfBirth,
      sex: HAJER.sex,

    });
    clientId = created.id;
    console.log(`client ${clientId} — ${HAJER.firstName} ${HAJER.lastName}`);

    const saved = await saveIntake(clinicId, { clientId, ...INTAKE }, userId);
    if (!saved) throw new Error('The intake did not save.');
    console.log('intake saved');

    await createMeasurement(clinicId, clientId, { ...MEASUREMENT, recordedBy: userId });
    console.log('measurement saved');
  }

  const context = await getClientContext(clinicId, clientId);
  if (!context?.profile || context.effectiveKcal === null) {
    throw new Error('The profile is incomplete — no calorie target.');
  }

  console.log(
    `age ${context.age} · BMI ${context.targets.bmi} (${context.targets.bmiCategory}) · ` +
      `${context.effectiveKcal} kcal · protein ${context.effectiveProteinGrams} g`,
  );

  const catalog = await loadCatalog(clinicId, context.profile.allergenTags);
  console.log(`catalog ${catalog.length} dishes`);

  const started = Date.now();
  const outcome: GenerationOutcome = await runReviewedGeneration({
    input: {
      client: {
        age: context.age,
        sex: context.sex,
        heightCm: context.heightCm,
        weightKg: context.profile.weightKg,
        bmi: context.targets.bmi,
        bmiCategory: context.targets.bmiCategory,
        activityLevel: context.activityLevel,
        goal: context.goal,
        dailyKcalTarget: context.effectiveKcal,
        proteinTargetGrams: context.effectiveProteinGrams,
        allergies: context.allergies,
        preferences: context.profile.preferences,
        dislikes: context.profile.dislikes,
        permanentInstructions: context.profile.permanentInstructions,
        clinicalTags: context.profile.clinicalTags,
        dietPattern: context.profile.dietPattern,
      },
      budgets: context.budgets,
      catalog: toPromptCatalog(catalog, context.profile.dietPattern),
      sides: toPromptSides(catalog, context.profile.dietPattern),
      instruction: null,
      previousSlugs: [],
      days: [...DAYS_OF_WEEK],
      scope: 'week',
    },
    catalog: toPromptCatalog(catalog, context.profile.dietPattern),
    allergens: context.profile.allergenTags,
    sides: toPromptSides(catalog, context.profile.dietPattern),
    kcalTarget: context.effectiveKcal,
    proteinTargetGrams: context.effectiveProteinGrams,
  });

  console.log(
    `generated in ${Math.round((Date.now() - started) / 1000)}s · ${outcome.meals.length} meals · ` +
      `${outcome.warnings.length} warnings`,
  );

  const weekStartDate = nextMonday();
  const planId = await createPlanFromGeneration({
    clinicId,
    clientId,
    weekStartDate,
    kcalTarget: context.effectiveKcal,
    proteinTarget: null,
    goal: null,
    weekInstructions: null,
    outcome,
  });

  console.log(`plan ${planId} — week of ${weekStartDate}`);
  process.exit(0);
}

void main();
