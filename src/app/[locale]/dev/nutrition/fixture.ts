import { type ClientIntakeValues } from '@/features/clients/types';

/**
 * One client's nutrition record, for `/dev/nutrition`.
 *
 * The 78 kg, 160 cm woman at 30% body fat who runs through this feature's
 * tests and its documentation — see `suggestProteinGrams`' own cases. She is
 * the useful subject because every rule the clinic can set gives her a
 * different answer: her adjusted weight is 58.8 kg and the analyser puts her
 * fat-free mass at 54.6, so "1 g per kg" is 78 g, 59 g or 55 g depending on
 * which the clinic picked. A client at a healthy weight would read the same
 * under all three and prove nothing.
 *
 * ⚠ `dailyKcalTarget` and `proteinTargetGrams` are null on purpose. Both fall
 * back to the suggestion when they are, which is the only state in which the
 * rules being changed are visible at all — an overridden target ignores them.
 */
export const FIXTURE_INTAKE: ClientIntakeValues = {
  clientId: '00000000-0000-4000-8000-000000000001',
  fullName: 'هبة قنام',

  dateOfBirth: '1988-04-12',
  sex: 'female',

  heightCm: 160,
  goal: 'weight_loss',
  activityLevel: 'light',

  weightKg: 78,

  allergenTags: ['lactose'],
  customAllergens: [],
  allergies: 'حساسية خفيفة من الجوز، لا اللوز.',

  clinicalTags: [],
  dietPattern: null,
  conditions: null,
  medications: null,
  medicalNotes: 'ارتفاع طفيف في ضغط الدم — تقليل الصوديوم.',
  notes: null,

  dailyKcalTarget: null,
  proteinTargetGrams: null,
  preferences: 'تحب الشوربات، ووجبة الفطور خفيفة.',
  dislikes: 'لا تأكل الكبدة.',
  permanentInstructions: null,
  mealSchedule: [
    { slotKey: 'breakfast', label: 'الفطور', timeOfDay: '08:00', kcalShare: 0.25 },
    { slotKey: 'snack_1', label: 'سناك', timeOfDay: '11:00', kcalShare: 0.1 },
    { slotKey: 'lunch', label: 'الغداء', timeOfDay: '14:00', kcalShare: 0.35 },
    { slotKey: 'snack_2', label: 'سناك', timeOfDay: '17:00', kcalShare: 0.1 },
    { slotKey: 'dinner', label: 'العشاء', timeOfDay: '20:00', kcalShare: 0.2 },
  ],

  maritalStatus: 'married',
  childrenCount: 2,
  bloodType: 'O+',
  occupation: 'معلّمة',

  visitReason: 'زيادة في الوزن بعد الحمل الثاني.',
  dietHistory: null,
  drugAllergies: null,
  familyHistory: null,

  activityNotes: 'مشي ٤٠ دقيقة أغلب المساءات، عمل مكتبي.',
  activityBarriers: null,
  sleepHours: 6.5,
  smoking: 'never',

  caffeineFrequency: 'daily_1_2',
  sweetDrinksFrequency: null,
  fastFoodFrequency: null,
  vegetablesFrequency: null,
  fruitFrequency: null,
  dairyFrequency: null,
  redMeatFrequency: null,
  chickenFrequency: null,
  fishFrequency: null,
  sweetsFrequency: null,

  hasProfile: true,
};

/**
 * What the analyser last printed for her.
 *
 * ⚠ **The BMR is chosen to clear the 8% threshold, not picked for realism.**
 * Mifflin-St Jeor puts this client at 1,429 kcal, so 1,300 is a gap of 129 kcal
 * a day — nine percent, which is past the bar the Nutrition tab draws its
 * notice at. The first figure tried here was the 1,321 off the real report that
 * prompted this work, and against *her* height and age that lands at 7.6%: the
 * card computed a target from the device and then said nothing about having
 * done so, which is precisely the state a harness exists to catch.
 *
 * `?scan=none` takes both figures away — the fallback every screen has to
 * handle and the one nobody looks at.
 */
export const FIXTURE_COMPOSITION = {
  basalMetabolicRateKcal: 1300,
  fatFreeMassKg: 54.6,
};
