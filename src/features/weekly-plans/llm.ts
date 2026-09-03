/**
 * The seam between this feature and OpenAI.
 *
 * Same shape as `src/lib/mail/`: an interface, two transports, and a factory that
 * reads the environment. `console` plans locally and needs no key, which is what
 * lets `generate.ts` be tested end to end with no network — the alternative is
 * mocking the OpenAI SDK, which tests the mock.
 *
 * Nothing above this file knows that OpenAI exists.
 */

import type { PromptPayload } from './prompt';

export type LlmUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
};

export type LlmResult = {
  /** The raw JSON text. Parsing and validation belong to `generate.ts`. */
  content: string;
  model: string;
  usage: LlmUsage;
};

export interface LlmTransport {
  readonly model: string;
  complete(payload: PromptPayload, signal?: AbortSignal): Promise<LlmResult>;
}

/**
 * Raised for anything that went wrong talking to the provider.
 *
 * A distinct type so `generate.ts` can tell "the provider is unreachable" — retry
 * or surface, nothing written — from "the provider replied with something we
 * cannot use", which is a validation problem with a different remedy.
 */
export class LlmTransportError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LlmTransportError';
  }
}

/** Raised when the environment cannot support generation at all. */
export class LlmNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmNotConfiguredError';
  }
}

/**
 * How long to wait before giving up.
 *
 * Measured against `gpt-4o-mini`: a seven-day plan is ~3,150 completion tokens and
 * takes ~55s; a single day is ~865 tokens and ~12s. The cost is output tokens, not
 * schema size — the JSON schema is byte-identical for one day and for seven, because
 * a day is one `items` schema either way.
 *
 * 100s leaves headroom over the measured 55s while sitting under the 120s
 * route-segment `maxDuration`, so a slow run aborts with a message we control rather
 * than the platform killing the function mid-write.
 *
 * The exception to budget for: the FIRST request using a given schema shape pays for
 * grammar compilation on OpenAI's side, which can add tens of seconds. That happens
 * again whenever the catalog changes or a client's slot set changes. If it bites, the
 * per-day regenerate button uses the same contract at a fifth of the output.
 */
export const LLM_TIMEOUT_MS = 100_000;

const DEFAULT_MODEL = 'gpt-5.6-luna';

/**
 * How hard a reasoning model should think before answering.
 *
 * Medium is the provider's own default and the setting this was measured at:
 * a plan takes about half again as long as `gpt-4o-mini` did and picks visibly
 * better. `high` and above are worth trying once the prompt stops changing under
 * them; `none` turns the model into a fast one and is what to reach for if the
 * route ever runs out of time.
 */
const DEFAULT_EFFORT = 'medium';

/**
 * Whether a model reasons, and therefore which request it takes.
 *
 * The `gpt-5.x` family thinks before it answers, which changes two things: it
 * rejects any `temperature` but 1, and OpenAI supports it on `/v1/responses`
 * rather than on chat completions, where reasoning and tools are documented as
 * an unsupported combination. Both follow from the model name, so the name picks
 * the route rather than a flag someone has to remember to set alongside it.
 */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o[1-9])/.test(model);
}

/**
 * Room for the answer and the thinking in front of it.
 *
 * A seven-day plan is roughly 1,900 tokens of JSON now that alternatives are
 * computed rather than written, and a reasoning pass over this prompt has been
 * measured at another 1,500-3,000. Sixteen thousand leaves the model no reason to
 * stop early, and an unused ceiling costs nothing — only tokens actually spent
 * are billed.
 */
const MAX_OUTPUT_TOKENS = 16_000;

/** Both reply shapes, read through one type because one function receives both. */
type OpenAiReply = {
  model?: string;
  status?: string;
  incomplete_details?: { reason?: string };
  output?: {
    type?: string;
    content?: { type?: string; text?: string }[];
  }[];
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
};

/**
 * The plan text out of a Responses reply.
 *
 * `status: 'incomplete'` is this route's version of `finish_reason: 'length'`,
 * and carries the same meaning: what came back is a truncated object that will
 * fail to parse for a reason invisible at the parse site. It is worth its own
 * message here rather than a syntax error there.
 */
function readResponse(json: OpenAiReply, model: string): LlmResult {
  if (json.status === 'incomplete') {
    throw new LlmTransportError(
      `OpenAI stopped before finishing the plan (${json.incomplete_details?.reason ?? 'unknown'}). Generate one day at a time.`,
    );
  }

  const message = json.output?.find((item) => item.type === 'message');
  const content = message?.content?.find((part) => part.type === 'output_text')?.text;

  if (!content) throw new LlmTransportError('OpenAI returned no content');

  return {
    content,
    model: json.model ?? model,
    usage: {
      promptTokens: json.usage?.input_tokens ?? null,
      completionTokens: json.usage?.output_tokens ?? null,
    },
  };
}

function readChatCompletion(json: OpenAiReply, model: string): LlmResult {
  const choice = json.choices?.[0];
  const content = choice?.message?.content;

  if (!content) {
    throw new LlmTransportError('OpenAI returned no content');
  }

  // A truncated response is valid JSON's worst enemy: it parses as a
  // syntax error rather than as a partial plan, and the reason why is only
  // visible here.
  if (choice.finish_reason === 'length') {
    throw new LlmTransportError(
      'OpenAI hit the output token limit before finishing the plan. Generate one day at a time.',
    );
  }

  return {
    content,
    model: json.model ?? model,
    usage: {
      promptTokens: json.usage?.prompt_tokens ?? null,
      completionTokens: json.usage?.completion_tokens ?? null,
    },
  };
}

/**
 * The real transport, over `fetch`.
 *
 * Deliberately not the `openai` SDK: this calls exactly one endpoint with one
 * response format, and a direct fetch is a dependency-free 40 lines that cannot
 * drift out of step with a major version bump.
 */
function createOpenAiTransport(apiKey: string, model: string): LlmTransport {
  const reasoning = isReasoningModel(model);
  const effort = process.env.OPENAI_REASONING_EFFORT ?? DEFAULT_EFFORT;

  /**
   * The two request shapes, which differ in more than their field names.
   *
   * A reasoning model spends output tokens thinking before the first visible
   * character, so `max_output_tokens` has to cover both the thinking and the
   * plan — a cap sized to the JSON alone comes back as a truncated object and a
   * syntax error. The schema is enforced the same way on both routes, which is
   * the part that matters: a dish outside the enum is unrepresentable either way.
   */
  const body = (payload: PromptPayload) =>
    reasoning
      ? {
          model,
          input: [
            { role: 'developer', content: payload.system },
            { role: 'user', content: payload.user },
          ],
          reasoning: { effort },
          max_output_tokens: MAX_OUTPUT_TOKENS,
          text: {
            format: {
              type: 'json_schema',
              name: 'weekly_plan',
              strict: true,
              schema: payload.jsonSchema,
            },
          },
        }
      : {
          model,
          // Low but not zero: the plan should be reproducible in character
          // without every client getting an identical week.
          temperature: 0.4,
          messages: [
            { role: 'system', content: payload.system },
            { role: 'user', content: payload.user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'weekly_plan',
              // The whole point: the provider rejects a response that names a
              // dish outside the enum, so a hallucinated dish never arrives.
              strict: true,
              schema: payload.jsonSchema,
            },
          },
        };

  return {
    model,

    async complete(payload, signal) {
      // Combine the caller's signal with our own timeout, so a hung connection
      // fails on our schedule rather than the platform's.
      const timeout = AbortSignal.timeout(LLM_TIMEOUT_MS);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

      let response: Response;

      try {
        response = await fetch(
          reasoning
            ? 'https://api.openai.com/v1/responses'
            : 'https://api.openai.com/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: `Bearer ${apiKey}`,
            },
            signal: combined,
            body: JSON.stringify(body(payload)),
          },
        );
      } catch (cause) {
        const aborted = cause instanceof Error && cause.name === 'TimeoutError';
        throw new LlmTransportError(
          aborted ? `OpenAI did not respond within ${LLM_TIMEOUT_MS / 1000}s` : 'Could not reach OpenAI',
          cause,
        );
      }

      if (!response.ok) {
        // The body carries the provider's own explanation, which is the only
        // useful thing in the audit row when this shows up in a week's time.
        const detail = await response.text().catch(() => '');
        throw new LlmTransportError(
          `OpenAI returned ${response.status} ${response.statusText}: ${detail.slice(0, 500)}`,
        );
      }

      const json = (await response.json()) as OpenAiReply;

      return reasoning ? readResponse(json, model) : readChatCompletion(json, model);
    },
  };
}

/**
 * Builds a plan locally, with no network.
 *
 * Not a canned fixture but a deterministic planner: it reads the per-slot dish
 * enums back out of the JSON schema the prompt just built and rotates through them,
 * so every test — and every developer without a key — exercises the real
 * validation and persistence path against a plan that is actually valid. A fixed
 * JSON fixture would go stale the moment the catalog changed, and would stop
 * exercising the interesting code.
 *
 * It is a stand-in, not a fallback: nothing selects it automatically.
 */
export function createConsoleTransport(): LlmTransport {
  return {
    model: 'console',

    async complete(payload) {
      const { days, slots } = describeSchema(payload.jsonSchema);

      const content = JSON.stringify({
        summaryAr: 'خطة تجريبية من الناقل المحلي.',
        days: days.map((dayOfWeek, dayIndex) => {
          const day: Record<string, unknown> = { dayOfWeek };

          for (const [slotIndex, slot] of slots.entries()) {
            if (!slot.dishes.length) continue;

            // Rotate by day AND slot, so the week is not seven identical days —
            // which would hide any variety bug the real path has.
            const chosen = slot.dishes[(dayIndex + slotIndex) % slot.dishes.length]!;

            day[slot.slotKey] = {
              dish: chosen,
              servings: 1,
              rationaleAr: 'اختيار تجريبي من الناقل المحلي.',
            };
          }

          return day;
        }),
      });

      return { content, model: 'console', usage: { promptTokens: null, completionTokens: null } };
    },
  };
}

/**
 * Reads the enums the prompt put in the schema, so the stand-in cannot drift out of
 * step with the contract it is standing in for.
 */
function describeSchema(schema: Record<string, unknown>): {
  days: number[];
  slots: { slotKey: string; dishes: string[] }[];
} {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const day = (schema as any).properties?.days?.items;
  const properties: Record<string, any> = day?.properties ?? {};

  const slots = Object.entries(properties)
    .filter(([key]) => key !== 'dayOfWeek')
    .map(([slotKey, value]) => ({ slotKey, dishes: (value?.properties?.dish?.enum ?? []) as string[] }));

  return { days: day?.properties?.dayOfWeek?.enum ?? [0], slots };
}

/**
 * Chooses a transport from the environment.
 *
 * Throws `LlmNotConfiguredError` rather than falling back to the stand-in when a
 * key is missing: a dietitian publishing a plan that a fixture invented, believing
 * a model produced it, is the worst outcome this feature has. The UI catches this
 * and disables the button with a configuration message.
 */
function createTransport(model: string): LlmTransport {
  const transport = process.env.LLM_TRANSPORT ?? 'openai';

  if (transport === 'console') return createConsoleTransport();

  if (transport !== 'openai') {
    throw new LlmNotConfiguredError(`Unknown LLM_TRANSPORT "${transport}". Use "console" or "openai".`);
  }

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new LlmNotConfiguredError('LLM_TRANSPORT=openai but OPENAI_API_KEY is not set.');
  }

  return createOpenAiTransport(apiKey, model);
}

const cached = new Map<string, LlmTransport>();

function transportFor(model: string): LlmTransport {
  const held = cached.get(model);
  if (held) return held;

  const made = createTransport(model);
  cached.set(model, made);
  return made;
}

export function getLlmTransport(): LlmTransport {
  return transportFor(process.env.OPENAI_MODEL ?? DEFAULT_MODEL);
}

/**
 * The transport a plan review goes over.
 *
 * Its own environment variable because the two jobs are not the same job.
 * Planning is a constrained choice from an enum and reviewing is judgement over
 * prose, and a clinic may reasonably want the cheaper model writing weeks and a
 * stronger one reading them — or the reverse, while a prompt is being tuned.
 * Falls back to the planning model, so one variable still configures both.
 */
export function getReviewTransport(): LlmTransport {
  return transportFor(process.env.OPENAI_REVIEW_MODEL ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL);
}

/**
 * Whether generation is possible at all, for the UI to check before offering it.
 *
 * Cheaper and clearer than letting the button throw: "OpenAI is not configured" is
 * a state the page can render, not an error it should surface.
 */
export function isLlmConfigured(): boolean {
  try {
    getLlmTransport();
    return true;
  } catch {
    return false;
  }
}
