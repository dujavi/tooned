import type { Config } from '@tooned/core';
import { buildPrompt, type EnrichmentPromptInput, type EnrichmentType } from './prompts.js';

export { buildPrompt, type EnrichmentPromptInput, type EnrichmentType } from './prompts.js';

export interface EnrichmentProvider {
  complete(prompt: string, maxTokens: number): Promise<string>;
}

export class LlmUnavailableError extends Error {
  constructor(message = 'LLM enrichment unavailable. Set LLM_API_KEY and LLM_MODEL, or use agent-only reasoning.') {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

export class OpenAiCompatibleProvider implements EnrichmentProvider {
  constructor(
    private readonly options: {
      apiKey: string;
      model: string;
      baseUrl?: string;
      fetchImpl?: typeof fetch;
    },
  ) {}

  async complete(prompt: string, maxTokens: number): Promise<string> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const endpoint = `${(this.options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/chat/completions`;
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0,
        max_tokens: maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = (await response.json()) as { error?: { message?: string } };
        detail = body.error?.message ?? detail;
      } catch {
        // Keep status text fallback.
      }
      throw new Error(`LLM request failed (${response.status}): ${detail}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('LLM returned empty completion');
    }
    return content;
  }
}

class NoopProvider implements EnrichmentProvider {
  async complete(): Promise<string> {
    return '';
  }
}

export function isLlmConfigured(config: Config): boolean {
  return Boolean(config.LLM_API_KEY && config.LLM_MODEL);
}

export function createEnrichmentProvider(config: Config): EnrichmentProvider {
  if (!config.LLM_API_KEY || !config.LLM_MODEL) {
    return new NoopProvider();
  }
  return new OpenAiCompatibleProvider({
    apiKey: config.LLM_API_KEY,
    model: config.LLM_MODEL,
    baseUrl: config.LLM_BASE_URL,
  });
}

export async function completeEnrichment(input: {
  provider: EnrichmentProvider;
  type: EnrichmentType;
  promptInput: EnrichmentPromptInput;
  maxTokens?: number;
}): Promise<string> {
  const prompt = buildPrompt(input.type, input.promptInput);
  return input.provider.complete(prompt, input.maxTokens ?? 220);
}
