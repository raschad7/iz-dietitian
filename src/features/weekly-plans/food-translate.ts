/**
 * The seam between food matching and OpenAI — same shape as `llm.ts`.
 *
 * The model translates an Arabic food name into English search keywords and does
 * nothing else: it never emits a nutrition number, so matching stays grounded in
 * the real library. The stub echoes its input, which is enough to exercise the
 * search path in tests and for developers without a key.
 */
export interface FoodTranslator {
  toKeywords(arabicName: string): Promise<string>;
}

export function createStubTranslator(): FoodTranslator {
  return { async toKeywords(arabicName) { return arabicName; } };
}

function createOpenAiTranslator(apiKey: string, model: string): FoodTranslator {
  return {
    async toKeywords(arabicName) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          model,
          temperature: 0,
          messages: [
            {
              role: 'system',
              content:
                'Translate the Arabic food name into 1-4 English keywords for searching a USDA food database. Reply with only the keywords, no punctuation, no explanation.',
            },
            { role: 'user', content: arabicName },
          ],
        }),
      });
      if (!response.ok) throw new Error(`OpenAI translation failed: ${response.status}`);
      const json = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      return json.choices?.[0]?.message?.content?.trim() || arabicName;
    },
  };
}

let cached: FoodTranslator | undefined;

/** Env-driven, like `getLlmTransport`. `LLM_TRANSPORT=console` (or no key) uses the stub. */
export function getFoodTranslator(): FoodTranslator {
  if (cached) return cached;
  const transport = process.env.LLM_TRANSPORT ?? 'openai';
  const apiKey = process.env.OPENAI_API_KEY;
  cached =
    transport === 'console' || !apiKey
      ? createStubTranslator()
      : createOpenAiTranslator(apiKey, process.env.OPENAI_MODEL ?? 'gpt-4o-mini');
  return cached;
}
