import type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Content,
  LanguageModelV2FinishReason,
  LanguageModelV2StreamPart,
  LanguageModelV2TextPart,
  LanguageModelV2ToolCallPart,
  LanguageModelV2ToolChoice
} from '@ai-sdk/provider';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool
} from 'openai/resources/chat';

interface NearAiConfig {
  apiKey: string;
  baseURL: string;
}

interface NearAiSettings {
  maxTokens?: number;
  temperature?: number;
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

    const messages: ChatCompletionMessageParam[] = prompt.flatMap((msg): ChatCompletionMessageParam[] => {
      if (msg.role === 'system') {
        return [{ role: 'system' as const, content: msg.content }];
      }
      if (msg.role === 'user') {
        const content = msg.content
          .map((part) => part.type === 'text' ? part.text : '')
          .join('\n');
        return [{ role: 'user' as const, content }];
      }
      if (msg.role === 'assistant') {
        const textContent = msg.content
          .filter((part): part is LanguageModelV2TextPart => part.type === 'text')
          .map((part) => part.text)
          .join('\n');

        const toolCalls = msg.content
          .filter((part): part is LanguageModelV2ToolCallPart => part.type === 'tool-call')
          .map((part) => ({
            id: part.toolCallId,
            type: 'function' as const,
            function: {
              name: part.toolName,
              arguments: typeof part.input === 'string' ? part.input : JSON.stringify(part.input),
            },
          }));

        if (toolCalls.length > 0) {
          return [{
            role: 'assistant' as const,
            content: textContent || null,
            tool_calls: toolCalls,
          }];
        }

        return [{ role: 'assistant' as const, content: textContent }];
      }
      if (msg.role === 'tool') {
        return msg.content.map((part) => ({
          role: 'tool' as const,
          tool_call_id: part.toolCallId,
          content: typeof part.output === 'string' ? part.output : JSON.stringify(part.output),
        }));
      }
      return [];
    });

    const tools: ChatCompletionTool[] | undefined = options.tools && options.tools.length > 0
      ? options.tools
        .filter((tool) => tool.type === 'function')
        .map((tool) => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description || '',
            parameters: tool.inputSchema as Record<string, unknown>,
          },
        }))
      : undefined;

    const requestBody: Record<string, unknown> = {
      model: this.modelId,
      messages,
      max_tokens: settings.maxOutputTokens ?? this.settings.maxTokens ?? 500,
      temperature: settings.temperature ?? this.settings.temperature ?? 0.7,
    };

    if (tools) {
      requestBody.tools = tools;
      if (options.toolChoice) {
        requestBody.tool_choice = this.convertToolChoice(options.toolChoice);
      }
    }


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

      const data = await response.json() as ChatCompletion;

      const choice = data.choices[0];
      if (!choice || !choice.message) {
        throw new Error('Invalid response format from NEAR AI API');
      }

      const content: LanguageModelV2Content[] = [];

      if (choice.message.content) {
        content.push({
          type: 'text' as const,
          text: choice.message.content
        });
      }

      if (choice.message.tool_calls) {
        for (const toolCall of choice.message.tool_calls) {
          if (toolCall.type === 'function') {
            content.push({
              type: 'tool-call' as const,
              toolCallId: toolCall.id,
              toolName: toolCall.function.name,
              input: JSON.parse(toolCall.function.arguments),
            });
          }
        }
      }

      const finishReason = this.mapFinishReason(choice.finish_reason);

      return {
        content,
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

  private convertToolChoice(toolChoice: LanguageModelV2ToolChoice): string | { type: string; function?: { name: string } } {
    if (toolChoice.type === 'auto') {
      return 'auto';
    }
    if (toolChoice.type === 'none') {
      return 'none';
    }
    if (toolChoice.type === 'required') {
      return 'required';
    }
    return {
      type: 'function',
      function: { name: toolChoice.toolName },
    };
  }

  private mapFinishReason(finishReason: string | null | undefined): LanguageModelV2FinishReason {
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
