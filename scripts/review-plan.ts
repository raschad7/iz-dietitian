/**
 * Reads a finished plan back the way a client reads it, and asks a model what a
 * dietitian would say about it.
 *
 *   bun run plan:review                          # newest plan in this database
 *   bun run plan:review --plan <uuid>
 *   bun run plan:review --file plan.txt          # a plan from another database
 *   bun run plan:review --model gpt-4o-mini      # compare two models on one plan
 *   bun run plan:review --effort high            # gpt-5.x reasoning effort
 *   bun run plan:review --print-only             # exactly what the model is shown
 *   bun run plan:review --out review.json        # keep the structured findings
 *
 * `--file` takes a plan already rendered to text — a week from production, which
 * this machine's database does not hold. Nothing is checked arithmetically in
 * that mode, because there is no board to check, and the model is told so rather
 * than left to assume the numbers were vetted.
 *
 * ## Why a script and not a feature
 *
 * A review pass inside `generateWeekAction` would double the wall clock of a
 * generation that already sits near the route's 120s ceiling, and it would do it
 * before anyone has established that a second opinion is worth paying for. This
 * runs outside the request, against plans that already exist, and changes
 * nothing: it is the experiment that decides whether the feature is built, and
 * which model is worth building it on.
 *
 * ## The division of labour it demonstrates
 *
 * Everything countable is counted **here**, in {@link arithmeticFindings} — day
 * calories against the target, a meal against its slot budget, a portion count
 * no one can serve, an ingredient that turns up in half the week. Those checks
 * are free, instant and cannot be wrong, and the model is told what they already
 * found so it does not spend its answer repeating them.
 *
 * What is left for the model is the part arithmetic cannot reach: whether this
 * reads like food a family eats, whether a day has a sensible shape, whether the
 * dietitian's instruction was honoured in spirit. It answers in the same
 * structured form the eventual feature would apply — a list of findings keyed to
 * a day and a slot — so what is learned here transfers rather than being thrown
 * away.
 *
 * ## What the model is shown
 *
 * The plan as the *client* sees it: `printPlan`, the same call behind the
 * printed handout, rendered to text. `تمر مجهول 1.88 حبة` is obvious to a reader
 * and awkward to express as a rule, which is the whole argument for showing the
 * document rather than the data behind it.
 *
 * The client is described, never identified — the discipline `prompt.ts` already
 * holds. The name on the handout is dropped here; the target, the goal and the
 * week's instruction are what a reviewer needs.
 */
import { desc, eq } from 'drizzle-orm';

import { db } from '@/db';
import { weeklyPlans } from '@/db/schema';
import { DAY_TOLERANCE, driftState, MEAL_TOLERANCE } from '@/features/weekly-plans/drift';
import { localizedName } from '@/features/weekly-plans/food-display';
import { formatQuantity, ingredientAmount } from '@/features/weekly-plans/meal-quantity';
import { printPlan, type PrintPlan } from '@/features/weekly-plans/plan-print';
import { getBoard, type Board } from '@/features/weekly-plans/queries';

const DAY_NAMES_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** What a million tokens costs, for the line at the bottom of the report. */
const PRICES: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-5.6-luna': { input: 0.2, output: 1.2 },
  'gpt-5.6-terra': { input: 2, output: 12 },
  'gpt-5.6-sol': { input: 4, output: 20 },
};

const DEFAULT_MODEL = 'gpt-5.6-luna';

/**
 * Room for the answer *and* the thinking that precedes it.
 *
 * A reasoning model spends output tokens before the first visible character, so
 * a cap sized to the JSON alone truncates the response into a syntax error. The
 * findings themselves are perhaps 1,500 tokens; the rest is headroom.
 */
const MAX_OUTPUT_TOKENS = 12_000;

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

/* -------------------------------------------------------------------------- */
/* The plan, as a reader sees it                                              */
/* -------------------------------------------------------------------------- */

/**
 * The handout as plain text.
 *
 * Slot budgets ride along beside each meal's own figure — they are not on the
 * client's copy, but "غداء 823 kcal (الميزانية 867)" is the difference between a
 * reviewer judging a meal and a reviewer guessing what it was aiming at.
 */
function renderPlanText(plan: PrintPlan, board: Board): string {
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
        const written = amount.kind === 'portion' ? amount.text : `${amount.grams} غ`;
        out.push(`    · ${localizedName(line.food, 'ar')} ${written}`);
      }

      if (meal.alternatives.length) {
        const alternatives = meal.alternatives
          .map((alternative) => `${alternative.name} ${alternative.kcal} kcal`)
          .join(' · ');
        out.push(`    بدائل: ${alternatives}`);
      }
    }
  }

  return out.join('\n');
}

/* -------------------------------------------------------------------------- */
/* What the code checks, so the model does not have to                        */
/* -------------------------------------------------------------------------- */

/** Counts a piece portion nobody serves. Bread and cups are excluded — 1½ رغيف is fine. */
const COUNTABLE_LABELS = new Set(['Piece', 'Slice']);
const MAX_PIECES = 3;

/**
 * Every finding that is a question about numbers rather than about judgement.
 *
 * Deliberately exhaustive on the cheap checks: this is the half of a review that
 * should never be bought from a model, and seeing it written out is half the
 * argument for the split.
 */
function arithmeticFindings(board: Board): string[] {
  const found: string[] = [];
  const target = board.kcalTargetSnapshot;
  const proteinTarget = board.proteinTargetSnapshot;

  /** Meals each primary food appears in, across the week and within a day. */
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

        if (line.isPrimary) {
          weekUse.set(name, (weekUse.get(name) ?? 0) + 1);
          dayUse.set(name, (dayUse.get(name) ?? 0) + 1);
        }

        const count = line.portionQuantity;
        if (!line.portion || typeof count !== 'number' || !(count > 0)) continue;

        // A count `formatQuantity` cannot write as a fraction is a count that
        // reaches the client as "1.88 حبة".
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
  const repeated = [...weekUse.entries()]
    .filter(([, uses]) => uses >= 4)
    .sort((a, b) => b[1] - a[1]);

  for (const [name, uses] of repeated) {
    found.push(`الأسبوع: "${name}" مكوّن أساسي في ${uses} من ${mealCount} وجبة.`);
  }

  return found;
}

/* -------------------------------------------------------------------------- */
/* The review                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The shape the answer must take.
 *
 * Every verb here is one the eventual feature could execute against the board —
 * a finding is keyed to a day and a slot, carries a severity the UI can sort by,
 * and names a suggestion rather than a rewritten meal. The model points; the
 * code would move. Strict mode forbids optional properties, so `dayOfWeek` is
 * nullable rather than absent for a finding about the whole week.
 */
const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'summaryAr', 'topProblems', 'findings'],
  properties: {
    verdict: { type: 'string', enum: ['usable', 'needs_work', 'not_usable'] },
    summaryAr: { type: 'string' },
    topProblems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['titleAr', 'whyAr'],
        properties: { titleAr: { type: 'string' }, whyAr: { type: 'string' } },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['dayOfWeek', 'slotKey', 'severity', 'category', 'problemAr', 'suggestionAr'],
        properties: {
          dayOfWeek: { type: ['integer', 'null'], enum: [0, 1, 2, 3, 4, 5, 6, null] },
          slotKey: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          category: {
            type: 'string',
            enum: [
              'portion_unrealistic',
              'repetition',
              'day_shape',
              'instruction_ignored',
              'culture_fit',
              'variety',
              'clinical',
              'wording',
              'other',
            ],
          },
          problemAr: { type: 'string' },
          suggestionAr: { type: 'string' },
        },
      },
    },
  },
} as const;

function buildSystemPrompt(): string {
  return [
    'You are a senior clinical dietitian in Hebron, Palestine, reviewing a weekly meal plan that a junior colleague produced with software.',
    'You are reading the plan exactly as the client receives it.',
    '',
    'The software already guarantees, and you must NOT spend findings on:',
    '- nutrition values: every number is computed from a food composition table, never invented;',
    '- allergens: dishes carrying the client\'s allergens were removed before planning;',
    '- arithmetic: calorie and protein totals, slot budgets, portion counts and ingredient repetition have already been checked by code, and what those checks found is listed for you below.',
    '',
    'Review the judgement the numbers cannot reach:',
    '- Would a real family in this region eat this week? Is anything embarrassing to hand over?',
    '- Does each day have a sensible shape — what is eaten warm, what is eaten cold, what is realistic to cook at that hour?',
    '- Is the week varied in a way a person notices, not only in a way a rule counts?',
    '- Was the dietitian\'s instruction for the week honoured in spirit, not only literally?',
    '- Is the Arabic natural, and does each portion read as an instruction someone can follow?',
    '',
    'Rules for your answer:',
    '- Write every Arabic field in plain clinical Arabic. No marketing language.',
    '- One finding per problem. Rank by how much it would embarrass the clinic.',
    '- A finding must name what is wrong AND what to do instead. "Not varied enough" without a replacement is not a finding.',
    '- Do not propose specific nutrition numbers. Say bigger, smaller, or name a different kind of dish.',
    '- At most 12 findings. Fewer, if fewer are real.',
    '- slotKey must be one of the slot keys shown in square brackets on each meal line, or "week" for a finding about the whole plan.',
  ].join('\n');
}

function buildUserPrompt(planText: string, checks: readonly string[] | null): string {
  const section =
    checks === null
      ? [
          '## الفحوصات الحسابية',
          'لم تُجرَ على هذه النسخة. افحص الأرقام والكميات بنفسك أيضًا.',
        ]
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

type ModelCall = {
  content: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
};

/**
 * One call, over whichever endpoint the model wants.
 *
 * `gpt-5.x` reasons by default, which rules out both the `temperature` this
 * codebase sends today and, when tools are involved, the chat-completions
 * endpoint itself. The Responses API is where those models are supported without
 * caveats, so the family decides the route rather than a flag someone has to
 * remember to set.
 */
async function callModel(
  model: string,
  effort: string,
  system: string,
  user: string,
): Promise<ModelCall> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set. Add it to .env.local.');

  const reasoning = model.startsWith('gpt-5');

  const url = reasoning
    ? 'https://api.openai.com/v1/responses'
    : 'https://api.openai.com/v1/chat/completions';

  const body = reasoning
    ? {
        model,
        input: [
          { role: 'developer', content: system },
          { role: 'user', content: user },
        ],
        reasoning: { effort },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        text: {
          format: { type: 'json_schema', name: 'plan_review', strict: true, schema: REVIEW_SCHEMA },
        },
      }
    : {
        model,
        temperature: 0.3,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'plan_review', strict: true, schema: REVIEW_SCHEMA },
        },
      };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });

  if (!response.ok) {
    throw new Error(
      `${model} returned ${response.status}: ${(await response.text().catch(() => '')).slice(0, 800)}`,
    );
  }

  const json = (await response.json()) as Record<string, unknown>;

  return reasoning ? readResponsesReply(json, model) : readChatReply(json, model);
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function readResponsesReply(json: any, model: string): ModelCall {
  if (json.status === 'incomplete') {
    throw new Error(`${model} stopped early: ${json.incomplete_details?.reason ?? 'unknown'}`);
  }

  const message = (json.output ?? []).find((item: any) => item.type === 'message');
  const text = (message?.content ?? []).find((part: any) => part.type === 'output_text')?.text;

  if (!text) throw new Error(`${model} returned no text. Raw status: ${json.status}`);

  return {
    content: text,
    model: json.model ?? model,
    inputTokens: json.usage?.input_tokens ?? null,
    outputTokens: json.usage?.output_tokens ?? null,
    reasoningTokens: json.usage?.output_tokens_details?.reasoning_tokens ?? null,
  };
}

function readChatReply(json: any, model: string): ModelCall {
  const choice = json.choices?.[0];

  if (choice?.finish_reason === 'length') {
    throw new Error(`${model} hit the output limit before finishing.`);
  }

  const content = choice?.message?.content;
  if (!content) throw new Error(`${model} returned no content.`);

  return {
    content,
    model: json.model ?? model,
    inputTokens: json.usage?.prompt_tokens ?? null,
    outputTokens: json.usage?.completion_tokens ?? null,
    reasoningTokens: json.usage?.completion_tokens_details?.reasoning_tokens ?? null,
  };
}

type Review = {
  verdict: string;
  summaryAr: string;
  topProblems: { titleAr: string; whyAr: string }[];
  findings: {
    dayOfWeek: number | null;
    slotKey: string;
    severity: string;
    category: string;
    problemAr: string;
    suggestionAr: string;
  }[];
};

/* eslint-enable @typescript-eslint/no-explicit-any */

/* -------------------------------------------------------------------------- */
/* Report                                                                      */
/* -------------------------------------------------------------------------- */

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

function printReport(review: Review, call: ModelCall, durationMs: number): void {
  console.log('');
  console.log(`الحكم: ${review.verdict}`);
  console.log(review.summaryAr);

  if (review.topProblems.length) {
    console.log('');
    console.log('أهم المشاكل:');
    for (const problem of review.topProblems) {
      console.log(`  • ${problem.titleAr} — ${problem.whyAr}`);
    }
  }

  console.log('');
  console.log(`الملاحظات (${review.findings.length}):`);

  const sorted = [...review.findings].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3),
  );

  for (const finding of sorted) {
    const where =
      finding.dayOfWeek === null
        ? 'الأسبوع'
        : `${DAY_NAMES_AR[finding.dayOfWeek] ?? ''} · ${finding.slotKey}`;
    console.log('');
    console.log(`  [${finding.severity}] [${finding.category}] ${where}`);
    console.log(`    المشكلة: ${finding.problemAr}`);
    console.log(`    الاقتراح: ${finding.suggestionAr}`);
  }

  const price = PRICES[call.model] ?? PRICES[call.model.replace(/-\d{4}-\d{2}-\d{2}$/, '')];
  const cost =
    price && call.inputTokens !== null && call.outputTokens !== null
      ? (call.inputTokens * price.input + call.outputTokens * price.output) / 1_000_000
      : null;

  console.log('');
  console.log(
    [
      `النموذج ${call.model}`,
      `${(durationMs / 1000).toFixed(1)}s`,
      `دخل ${call.inputTokens ?? '?'}`,
      `خرج ${call.outputTokens ?? '?'}${call.reasoningTokens ? ` (تفكير ${call.reasoningTokens})` : ''}`,
      cost === null ? 'التكلفة غير معروفة' : `التكلفة ≈ $${cost.toFixed(4)}`,
    ].join(' · '),
  );
}

/* -------------------------------------------------------------------------- */

/** A plan text and the checks that ran over it, from whichever source was named. */
async function loadPlan(): Promise<{ text: string; checks: string[] | null; label: string }> {
  const file = arg('file');

  if (file) {
    return { text: await Bun.file(file).text(), checks: null, label: file };
  }

  const planId = arg('plan');

  const [row] = planId
    ? await db
        .select({ id: weeklyPlans.id, clinicId: weeklyPlans.clinicId })
        .from(weeklyPlans)
        .where(eq(weeklyPlans.id, planId))
        .limit(1)
    : await db
        .select({ id: weeklyPlans.id, clinicId: weeklyPlans.clinicId })
        .from(weeklyPlans)
        .orderBy(desc(weeklyPlans.createdAt))
        .limit(1);

  if (!row) {
    console.error(planId ? `No plan ${planId} in this database.` : 'This database holds no plans.');
    process.exit(1);
  }

  const board = await getBoard(row.clinicId, row.id);

  if (!board) {
    console.error(`Plan ${row.id} could not be loaded.`);
    process.exit(1);
  }

  console.log(`Plan ${board.id} · week of ${board.weekStartDate} · ${board.status}`);
  console.log(`Generated by ${board.generatedBy}${board.model ? ` (${board.model})` : ''}`);

  return {
    text: renderPlanText(printPlan(board, 'ar'), board),
    checks: arithmeticFindings(board),
    label: board.id,
  };
}

async function main(): Promise<void> {
  const { text: planText, checks, label } = await loadPlan();

  if (checks === null) {
    console.log(`Reviewing ${label} — no arithmetic checks, this copy has no board behind it.`);
  } else {
    console.log('');
    console.log(`Arithmetic checks found ${checks.length} problem(s):`);
    for (const line of checks) console.log(`  - ${line}`);
  }

  if (process.argv.includes('--print-only')) {
    console.log('');
    console.log('--- what the model would be shown ---');
    console.log(planText);
    return;
  }

  const model = arg('model') ?? process.env.OPENAI_REVIEW_MODEL ?? DEFAULT_MODEL;
  const effort = arg('effort') ?? 'medium';

  console.log('');
  console.log(`Asking ${model}…`);

  const startedAt = Date.now();
  const call = await callModel(model, effort, buildSystemPrompt(), buildUserPrompt(planText, checks));
  const durationMs = Date.now() - startedAt;

  const review = JSON.parse(call.content) as Review;
  printReport(review, call, durationMs);

  const out = arg('out');
  if (out) {
    await Bun.write(out, JSON.stringify({ plan: label, model: call.model, review }, null, 2));
    console.log('');
    console.log(`Findings written to ${out}`);
  }
}

await main();
process.exit(0);
