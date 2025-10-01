import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart
} from '@ai-sdk/provider';

interface NearAiConfig {
  apiKey: string;
  baseURL: string;
}

interface NearAiSettings {
  maxTokens?: number;
  temperature?: number;
}

interface NearAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class NearAiLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = 'v2';
  readonly provider = 'near-ai';
  readonly modelId: string;
  readonly defaultObjectGenerationMode = undefined;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  private config: NearAiConfig;
  private settings: NearAiSettings;

  constructor(modelId: string, config: NearAiConfig, settings: NearAiSettings = {}) {
    this.modelId = modelId;
    this.config = config;
    this.settings = settings;
  }

  async doGenerate(options: LanguageModelV2CallOptions) {
    const { prompt, ...settings } = options;

    // Convert AI SDK prompt format to NEAR AI format
    const messages = prompt.map((msg) => {
      if (msg.role === 'system') {
        return { role: 'system', content: msg.content };
      }
      if (msg.role === 'user') {
        const content = msg.content
          .map((part) => part.type === 'text' ? part.text : '')
          .join('\n');
        return { role: 'user', content };
      }
      if (msg.role === 'assistant') {
        const content = msg.content
          .map((part) => part.type === 'text' ? part.text : '')
          .join('\n');
        return { role: 'assistant', content };
      }
      return null;
    }).filter(Boolean);

    const requestBody = {
      model: this.modelId,
      messages,
      max_tokens: settings.maxOutputTokens ?? this.settings.maxTokens ?? 500,
      temperature: settings.temperature ?? this.settings.temperature ?? 0.7,
    };


    try {
      const response = await fetch(`${this.config.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: options.abortSignal,
      });


      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`NEAR AI API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as NearAIResponse;

      const choice = data.choices[0];
      if (!choice || !choice.message) {
        throw new Error('Invalid response format from NEAR AI API');
      }

      const text = choice.message.content || '';
      const finishReason = this.mapFinishReason(choice.finish_reason);

      return {
        content: [{ type: 'text' as const, text }],
        usage: {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0,
        },
        finishReason,
        warnings: [] as LanguageModelV2CallWarning[],
        rawCall: { rawPrompt: prompt, rawSettings: settings },
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`NEAR AI request failed: ${String(error)}`);
    }
  }

  async doStream(options: LanguageModelV2CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>;
    rawCall: { rawPrompt: unknown; rawSettings: unknown };
    rawResponse?: { headers?: Record<string, string> };
    warnings?: LanguageModelV2CallWarning[];
  }> {
    // For now, implement streaming by falling back to generate
    const result = await this.doGenerate(options);
    const textContent = result.content.find(c => c.type === 'text')?.text || '';

    const stream = new ReadableStream<LanguageModelV2StreamPart>({
      start(controller) {
        // Send the text as a single chunk
        controller.enqueue({
          type: 'text-delta',
          id: 'delta-1',
          delta: textContent,
        });

        // Send finish event
        controller.enqueue({
          type: 'finish',
          finishReason: result.finishReason,
          usage: result.usage,
        });

        controller.close();
      },
    });

    return {
      stream,
      rawCall: result.rawCall,
      warnings: result.warnings,
    };
  }

  private mapFinishReason(finishReason: string | null | undefined): LanguageModelV2FinishReason {
    // could be enum
    switch (finishReason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content-filter';
      case 'tool_calls':
        return 'tool-calls';
      default:
        return 'unknown';
    }
  }
}

export function nearai(modelId: string = 'deepseek-v3.1', settings: NearAiSettings = {}) {
  return new NearAiLanguageModel(modelId, {
    apiKey: process.env.NEAR_AI_API_KEY!,
    baseURL: 'https://cloud-api.near.ai/v1'
  }, settings);
}
