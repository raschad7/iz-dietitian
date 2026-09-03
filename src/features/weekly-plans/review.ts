/**
 * A second reader for a finished plan.
 *
 * Generation has never had one. The week is built, written and handed over, and
 * the first person to look at it whole is the client — which is how `1.88 حبة`,
 * a bowl of raw pulses called falafel and a Monday of two chicken salads all
 * reached a printed sheet.
 *
 * This is that reader, and it runs **after** the plan exists rather than inside
 * the generation request. Two reasons, and the first is enough on its own: a
 * generation already sits near the route's 120-second ceiling and a second model
 * call would not fit. The second is better — a dietitian who sees the critique
 * and decides what to do with it is in charge of her own plan, where one whose
 * week silently rearranged itself is not.
 *
 * ## The division of labour
 *
 * Everything countable is counted here, in {@link arithmeticFindings}: a day
 * against its target, a meal against its slot, a portion nobody can serve, an
 * ingredient in half the week. Those checks are free, instant and cannot be
 * wrong, and the model is handed what they found so it does not spend its answer
 * repeating them.
 *
 * What is left is what arithmetic cannot reach — whether this reads like food a
 * family eats, whether a day has a shape, whether the dietitian's instruction was
 * honoured in spirit. The model answers in a fixed structure keyed to a day and a
 * slot, so a finding can be shown beside the meal it is about.
 *
 * ## What it is shown
 *
 * The plan as the *client* reads it: `printPlan`, the same call behind the
 * printed handout, rendered to text. A count like `1.88 حبة` is obvious to a
 * reader and awkward to express as a rule, which is the whole argument for
 * reading the document rather than the data behind it.
 *
 * The client is described and never identified — the discipline `prompt.ts`
 * holds, for the same reason.
 */

import { DAY_TOLERANCE, driftState, MEAL_TOLERANCE } from './drift';
import { localizedName } from './food-display';
import { getReviewTransport, type LlmResult } from './llm';
import { formatQuantity, ingredientAmount } from './meal-quantity';
import { printPlan } from './plan-print';
import type { PromptPayload } from './prompt';
import type { Board } from './queries';

const DAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export const REVIEW_VERDICTS = ['usable', 'needs_work', 'not_usable'] as const;
export type ReviewVerdict = (typeof REVIEW_VERDICTS)[number];

export const REVIEW_SEVERITIES = ['high', 'medium', 'low'] as const;
export type ReviewSeverity = (typeof REVIEW_SEVERITIES)[number];

export const REVIEW_CATEGORIES = [
  'portion_unrealistic',
  'repetition',
  'day_shape',
  'instruction_ignored',
  'culture_fit',
  'variety',
  'clinical',
  'wording',
  'other',
] as const;

export type ReviewFinding = {
  /** Null for a finding about the whole week. */
  dayOfWeek: number | null;
  slotKey: string;
  severity: string;
  category: string;
  problemAr: string;
  suggestionAr: string;
};

export type PlanReview = {
  verdict: string;
  summaryAr: string;
  findings: ReviewFinding[];
  /** What the arithmetic found, kept beside the model's answer. */
  checks: string[];
};

/* -------------------------------------------------------------------------- */
/* The plan, as a reader sees it                                              */
/* -------------------------------------------------------------------------- */

/**
 * The handout as plain text.
 *
 * Slot budgets ride along beside each meal's own figure. They are not on the
 * client's copy, but "غداء 617 kcal (الميزانية 867)" is the difference between a
 * reviewer judging a meal and a reviewer guessing what it was aiming at.
 */
export function renderPlanForReview(board: Board): string {
  const plan = printPlan(board, 'ar');
  const budgets = new Map(
    board.days.flatMap((day) => day.meals.map((meal) => [meal.id, meal.budgetKcal] as const)),
  );

  const out: string[] = [
    '# الخطة الأسبوعية كما يقرأها العميل',
    `الهدف اليومي: ${plan.kcalTarget} kcal` +
      (board.proteinTargetSnapshot ? ` · بروتين ${board.proteinTargetSnapshot} غ` : ''),
  ];

  if (board.goalSnapshot) out.push(`هدف العميل: ${board.goalSnapshot}`);
  if (board.weekInstructions) out.push(`تعليمات الأخصائية لهذا الأسبوع: ${board.weekInstructions}`);

  for (const day of plan.days) {
    out.push(
      '',
      `## ${DAY_NAMES_AR[day.dayOfWeek] ?? ''} — ${day.kcal} kcal · بروتين ${day.macros.protein} غ · كربوهيدرات ${day.macros.carbs} غ · دهون ${day.macros.fat} غ`,
    );

    for (const meal of day.meals) {
      const budget = budgets.get(meal.id);
      const aim = budget ? ` (الميزانية ${budget} kcal)` : '';

      out.push(
        `- [${meal.slotKey}] ${meal.label} ${meal.timeOfDay} · ${meal.dishName ?? '— فارغ —'} · ${meal.kcal} kcal${aim}`,
      );

      for (const line of meal.lines) {
        const amount = ingredientAmount(line, 'ar');
        // A side's lines carry its name, so the reader can tell "the lunch is
        // short" from "the lunch is fine and the salad is doing the work".
        const from = line.side ? `[${line.side.nameAr}] ` : '';
        out.push(
          `    · ${from}${localizedName(line.food, 'ar')} ${amount.kind === 'portion' ? amount.text : `${amount.grams} غ`}`,
        );
      }

      if (meal.alternatives.length) {
        out.push(
          `    بدائل: ${meal.alternatives.map((one) => `${one.name} ${one.kcal} kcal`).join(' · ')}`,
        );
      }
    }
  }

  return out.join('\n');
}

/* -------------------------------------------------------------------------- */
/* What the code checks, so the model does not have to                        */
/* -------------------------------------------------------------------------- */

/** Units a meal is counted in, where too many of them stops being a portion. */
const COUNTABLE_LABELS = new Set(['Piece', 'Slice']);
const MAX_PIECES = 3;

/**
 * Every finding that is a question about numbers rather than about judgement.
 *
 * Deliberately exhaustive on the cheap checks: this is the half of a review that
 * should never be bought from a model, and having it written out is half the
 * argument for the split.
 */
export function arithmeticFindings(board: Board): string[] {
  const found: string[] = [];
  const target = board.kcalTargetSnapshot;
  const proteinTarget = board.proteinTargetSnapshot;

  /** Meals each primary food appears in, across the week. */
  const weekUse = new Map<string, number>();

  for (const day of board.days) {
    const dayName = DAY_NAMES_AR[day.dayOfWeek] ?? '';
    const kcal = Math.round(day.totals.kcal.value);
    const drift = driftState(kcal, target, DAY_TOLERANCE);

    if (drift) {
      found.push(
        `${dayName}: اليوم ${kcal} kcal مقابل هدف ${target} kcal (${drift === 'over' ? 'أعلى' : 'أقل'} من ±${DAY_TOLERANCE * 100}%).`,
      );
    }

    if (proteinTarget) {
      const protein = Math.round(day.totals.protein.value);
      if (driftState(protein, proteinTarget, DAY_TOLERANCE)) {
        found.push(`${dayName}: بروتين اليوم ${protein} غ مقابل هدف ${proteinTarget} غ.`);
      }
    }

    const dayUse = new Map<string, number>();

    for (const meal of day.meals) {
      if (!meal.dish) {
        found.push(`${dayName} · ${meal.label}: خانة فارغة بلا وجبة.`);
        continue;
      }

      const mealKcal = Math.round(meal.totals.kcal.value);
      if (driftState(mealKcal, meal.budgetKcal, MEAL_TOLERANCE)) {
        found.push(
          `${dayName} · ${meal.label}: ${mealKcal} kcal مقابل ميزانية ${meal.budgetKcal} kcal.`,
        );
      }

      for (const line of meal.lines) {
        const name = localizedName(line.food, 'ar');

        // Only the main's primary lines count toward repetition. A salad beside
        // every lunch is a dietitian doing their job, not a week eating the same
        // thing twice.
        if (line.isPrimary && !line.side) {
          weekUse.set(name, (weekUse.get(name) ?? 0) + 1);
          dayUse.set(name, (dayUse.get(name) ?? 0) + 1);
        }

        const count = line.portionQuantity;
        if (!line.portion || typeof count !== 'number' || !(count > 0)) continue;

        // A count `formatQuantity` cannot write as a fraction is a count that
        // would reach the client as "1.88 حبة".
        if (formatQuantity(count, 'ar').includes('.')) {
          found.push(
            `${dayName} · ${meal.label}: ${name} ${formatQuantity(count, 'ar')} ${line.portion.labelAr} — كمية لا تُقاس في المطبخ.`,
          );
        }

        if (COUNTABLE_LABELS.has(line.portion.labelEn) && count > MAX_PIECES) {
          found.push(
            `${dayName} · ${meal.label}: ${name} ${formatQuantity(count, 'ar')} ${line.portion.labelAr} — أكثر مما يؤكل في جلسة واحدة.`,
          );
        }
      }
    }

    for (const [name, uses] of dayUse) {
      if (uses > 1) found.push(`${dayName}: "${name}" مكوّن أساسي في ${uses} وجبات في اليوم نفسه.`);
    }
  }

  const mealCount = board.days.reduce((sum, day) => sum + day.meals.length, 0);

  for (const [name, uses] of [...weekUse.entries()].filter(([, n]) => n >= 4).sort((a, b) => b[1] - a[1])) {
    found.push(`الأسبوع: "${name}" مكوّن أساسي في ${uses} من ${mealCount} وجبة.`);
  }

  return found;
}

/* -------------------------------------------------------------------------- */
/* The request                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The shape the answer must take.
 *
 * Every field is one a surface can act on: a finding is keyed to a day and a
 * slot, carries a severity the panel sorts by, and names a suggestion rather than
 * a rewritten meal. The model points; a person moves. Strict mode forbids
 * optional properties, so `dayOfWeek` is nullable rather than absent for a
 * finding about the whole week.
 */
const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'summaryAr', 'findings'],
  properties: {
    verdict: { type: 'string', enum: [...REVIEW_VERDICTS] },
    summaryAr: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['dayOfWeek', 'slotKey', 'severity', 'category', 'problemAr', 'suggestionAr'],
        properties: {
          dayOfWeek: { type: ['integer', 'null'], enum: [0, 1, 2, 3, 4, 5, 6, null] },
          slotKey: { type: 'string' },
          severity: { type: 'string', enum: [...REVIEW_SEVERITIES] },
          category: { type: 'string', enum: [...REVIEW_CATEGORIES] },
          problemAr: { type: 'string' },
          suggestionAr: { type: 'string' },
        },
      },
    },
  },
} as const;

/** At most this many findings. A list nobody finishes reading is a list nobody reads. */
const MAX_FINDINGS = 12;

function buildSystem(): string {
  return [
    'You are a senior clinical dietitian in Hebron, Palestine, reviewing a weekly meal plan that a junior colleague produced with software.',
    'You are reading the plan exactly as the client receives it.',
    '',
    'The software already guarantees, and you must NOT spend findings on:',
    '- nutrition values: every number is computed from a food composition table, never invented;',
    "- allergens: dishes carrying the client's allergens were removed before planning;",
    '- arithmetic: calorie and protein totals, slot budgets, portion counts and ingredient repetition have already been checked by code, and what those checks found is listed for you below.',
    '',
    'Review the judgement the numbers cannot reach:',
    '- Would a real family in this region eat this week? Is anything embarrassing to hand over?',
    '- Does each day have a sensible shape — what is eaten warm, what is eaten cold, what is realistic to cook at that hour?',
    '- Is the week varied in a way a person notices, not only in a way a rule counts?',
    "- Was the dietitian's instruction for the week honoured in spirit, not only literally?",
    '- Does a dish name match what is actually in it?',
    '- Is the Arabic natural, and does each portion read as an instruction someone can follow?',
    '',
    'Rules for your answer:',
    '- Write every Arabic field in plain clinical Arabic. No marketing language.',
    '- One finding per problem. Rank by how much it would embarrass the clinic.',
    '- A finding must name what is wrong AND what to do instead.',
    '- Do not propose specific nutrition numbers. Say bigger, smaller, or name a different kind of dish.',
    `- At most ${MAX_FINDINGS} findings. Fewer, if fewer are real.`,
    '- slotKey must be one of the slot keys shown in square brackets on each meal line, or "week" for a finding about the whole plan.',
  ].join('\n');
}

/**
 * `null` means the checks did not run, which is not the same as finding nothing.
 * Telling a reviewer the arithmetic is clean when nobody looked would buy silence
 * on exactly the problems it is best at spotting.
 */
function buildUser(planText: string, checks: readonly string[] | null): string {
  const section =
    checks === null
      ? ['## الفحوصات الحسابية', 'لم تُجرَ على هذه النسخة. افحص الأرقام والكميات بنفسك أيضًا.']
      : [
          '## ما وجدته الفحوصات الحسابية بالفعل (لا تكرّرها)',
          checks.length
            ? checks.map((line) => `- ${line}`).join('\n')
            : '- لا شيء. كل الأرقام ضمن الحدود.',
        ];

  return [
    planText,
    '',
    ...section,
    '',
    '## المطلوب',
    'راجع الخطة كما تراجع عمل زميلة، وأعطِ حكمك والملاحظات المهمة فقط.',
  ].join('\n');
}

/**
 * The request for a plan already rendered to text.
 *
 * Split from {@link buildReviewPayload} for one caller: `scripts/review-plan.ts`
 * reviews a week exported from another database, where there is no board to
 * check and `checks` is honestly empty rather than merely unrun.
 */
export function reviewPayloadFor(
  planText: string,
  checks: readonly string[] | null,
): PromptPayload {
  return {
    system: buildSystem(),
    user: buildUser(planText, checks),
    jsonSchema: REVIEW_SCHEMA as unknown as Record<string, unknown>,
  };
}

/** The whole request, assembled from a board. Pure, so it can be asserted without a model. */
export function buildReviewPayload(board: Board): { payload: PromptPayload; checks: string[] } {
  const checks = arithmeticFindings(board);

  return { payload: reviewPayloadFor(renderPlanForReview(board), checks), checks };
}

export class ReviewFailedError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ReviewFailedError';
  }
}

export type ReviewOutcome = {
  review: PlanReview;
  model: string;
  usage: LlmResult['usage'];
  durationMs: number;
};

/**
 * Reads a plan and returns what a dietitian would say about it.
 *
 * No retry. A review is an opinion, not a prescription: if the model returns
 * something unusable the honest answer is to say so and let the dietitian press
 * the button again, rather than to spend a second call correcting the first.
 */
export async function runReview(board: Board): Promise<ReviewOutcome> {
  const transport = getReviewTransport();
  const { payload, checks } = buildReviewPayload(board);
  const startedAt = Date.now();

  let result: LlmResult;

  try {
    result = await transport.complete(payload);
  } catch (cause) {
    throw new ReviewFailedError(
      cause instanceof Error ? cause.message : 'The model could not be reached',
      cause,
    );
  }

  try {
    const parsed = JSON.parse(result.content) as Omit<PlanReview, 'checks'>;

    return {
      review: {
        verdict: parsed.verdict,
        summaryAr: parsed.summaryAr,
        findings: (parsed.findings ?? []).slice(0, MAX_FINDINGS),
        checks,
      },
      model: result.model,
      usage: result.usage,
      durationMs: Date.now() - startedAt,
    };
  } catch (cause) {
    throw new ReviewFailedError('The model returned a review we could not read', cause);
  }
}
