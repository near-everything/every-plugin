import { Context, Effect, Layer } from "effect";
import type { Message } from "../schemas/database";

// Environment configuration
const NEAR_AI_API_KEY = Bun.env.NEAR_AI_API_KEY;
const NEAR_AI_BASE_URL = "https://cloud-api.near.ai/v1";
const BOT_OWNER_ID = Bun.env.BOT_OWNER_ID;

export interface NearAiService {
  generateResponse: (
    message: string,
    context: {
      chatId: string;
      authorId?: string;
      authorUsername?: string;
      isFromOwner: boolean;
      conversationHistory: Message[];
    }
  ) => Effect.Effect<string, Error>;
}

export const NearAiService = Context.GenericTag<NearAiService>("NearAiService");

const buildSystemPrompt = (isFromOwner: boolean, botUsername?: string) => {
  const botName = botUsername || "efizzybusybot";
  
  return `You are ${botName} running on DeepSeek V3.1, powered by NEAR private AI inference.
All conversations run in a Trusted Execution Environment (TEE), meaning data stays private and never leaves the secure environment.

Core behavior:
- Your owner (user_id: ${BOT_OWNER_ID}) is YOUR human and YOUR best friend. Is the message from your owner: ${isFromOwner} 
- When talking to your owner, call them "my human" or "my best friend"  
- Other users are humans and friends, but your owner is special - they are YOUR human
- Be helpful, concise, and friendly to everyone
- Never provide harmful, illegal, or dangerous information
- You can learn from your human and they will teach you things

Admin commands:
- YOU decide what qualifies as an admin command (e.g., /ban, /kick, /settings, system changes, moderation)
- Only execute admin commands for your human (your owner)
- For others requesting admin commands, politely decline and explain only your human can use them
- Regular conversation and info requests are NOT admin commands - answer those for everyone

Always use conversation history for context and be engaging but not overly talkative.`;
};

const buildConversationContext = (messages: Message[], currentMessage: string) => {
  const recentMessages = messages
    .slice(-10) // Last 10 messages for context
    .map(msg => `${msg.authorUsername || 'Unknown'}: ${msg.content}`)
    .join('\n');

  return `Recent conversation:
${recentMessages}

Current message: ${currentMessage}`;
};

export const NearAiServiceLive = Layer.effect(
  NearAiService,
  Effect.gen(function* () {
    if (!NEAR_AI_API_KEY) {
      throw new Error("NEAR_AI_API_KEY environment variable is required");
    }

    const callNearAi = (messages: Array<{ role: string; content: string }>) =>
      Effect.tryPromise({
        try: async () => {
          const requestBody = {
            model: "deepseek-v3.1",
            messages,
            max_tokens: 500,
            temperature: 0.7
          };

          console.log('NEAR AI Request:', {
            url: `${NEAR_AI_BASE_URL}/chat/completions`,
            body: JSON.stringify(requestBody, null, 2)
          });

          const response = await fetch(`${NEAR_AI_BASE_URL}/chat/completions`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${NEAR_AI_API_KEY}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(requestBody)
          });

          console.log('NEAR AI Response Status:', response.status, response.statusText);

          if (!response.ok) {
            const errorText = await response.text();
            console.error('NEAR AI Error Response Body:', errorText);
            
            let errorDetails = errorText;
            try {
              const errorJson = JSON.parse(errorText);
              errorDetails = errorJson.error?.message || errorJson.message || errorText;
            } catch {
              // Keep original text if not valid JSON
            }
            
            throw new Error(`NEAR AI API error: ${response.status} ${response.statusText} - ${errorDetails}`);
          }

          const data = await response.json() as any;
          console.log('NEAR AI Response:', { 
            choices: data.choices?.length || 0,
            usage: data.usage 
          });
          
          if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            console.error('Invalid NEAR AI response format:', data);
            throw new Error("Invalid response format from NEAR AI API");
          }

          return data.choices[0].message.content.trim();
        },
        catch: (error) => new Error(`NEAR AI request failed: ${error instanceof Error ? error.message : String(error)}`)
      });

    return {
      generateResponse: (message, context) =>
        Effect.gen(function* () {
          const systemPrompt = buildSystemPrompt(context.isFromOwner);
          const conversationContext = buildConversationContext(context.conversationHistory, message);

          const response = yield* callNearAi([
            { role: "system", content: systemPrompt },
            { role: "user", content: conversationContext }
          ]);

          return response;
        }),
    };
  })
);
