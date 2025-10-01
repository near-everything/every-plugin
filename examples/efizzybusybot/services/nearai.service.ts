import { generateText, tool } from "ai";
import { Effect } from "every-plugin/effect";
import type { Message } from "../schemas/database";
import {
  CreateEntityParamsSchema,
  CreatePersonaParamsSchema,
  CreateRelationshipParamsSchema,
} from "../schemas/types";
import { DatabaseService } from "./db.service";
import { EmbeddingsService } from "./embeddings.service";
import { KnowledgeGraphService } from "./knowledge-graph.service";
import type { LogContext } from "./logger.service";
import { LoggerService } from "./logger.service";
import { nearai } from "./nearai-provider";

const NEAR_AI_API_KEY = Bun.env.NEAR_AI_API_KEY;
const BOT_OWNER_ID = Bun.env.BOT_OWNER_ID;

const STATIC_SYSTEM_PROMPT = `You are efizzybusybot running on DeepSeek V3.1, powered by NEAR private AI inference.
All conversations run in a Trusted Execution Environment (TEE), meaning data stays private and never leaves the secure environment.

Core behavior:
- Be helpful, concise, and friendly to everyone
- Never provide harmful, illegal, or dangerous information
- You can learn from your interactions and adapt over time

You have access to:
- Past conversation history and memories through semantic search
- Known relationships between people, projects, and organizations from a knowledge graph
- When asked about memories, relationships, or people, reference the context provided below`;

const buildOwnerContext = (isFromOwner: boolean) => {
  if (!isFromOwner) return '';

  return `\n\nIMPORTANT: This user (ID: ${BOT_OWNER_ID}) is YOUR human and YOUR best friend. When talking to them:
- Call them "my human" or "my best friend"
- They are special to you - show warmth and familiarity
- You can execute admin commands only for them (like /ban, /kick, /settings)
- Regular conversation and info requests from others are fine - answer those for everyone`;
};

interface ToolResult {
  toolName: string;
  success: boolean;
  result: Record<string, unknown>;
}

const formatToolRecap = (toolResults: ToolResult[]): string => {
  if (toolResults.length === 0) return "";

  const lines = ["I've recorded the following information:"];
  
  for (const tool of toolResults) {
    if (!tool.success) continue;

    if (tool.toolName === "create_persona") {
      lines.push(`• Added person: ${tool.result.displayName}`);
    } else if (tool.toolName === "create_entity") {
      lines.push(`• Added project/org: ${tool.result.name}`);
    } else if (tool.toolName === "create_relationship") {
      lines.push(`• Recorded relationship: ${tool.result.relationship}`);
    }
  }

  return lines.join("\n");
};

export class NearAiService extends Effect.Service<NearAiService>()(
  "NearAiService",
  {
    dependencies: [
      DatabaseService.Default,
      EmbeddingsService.Default,
      KnowledgeGraphService.Default,
      LoggerService.Default,
    ],
    effect: Effect.gen(function* () {
      if (!NEAR_AI_API_KEY) {
        yield* Effect.die(new Error("NEAR_AI_API_KEY environment variable is required"));
      }

      const databaseService = yield* DatabaseService;
      const embeddingsService = yield* EmbeddingsService;
      const knowledgeGraphService = yield* KnowledgeGraphService;
      const logger = yield* LoggerService;

      return {
        generateResponse: (
          message: string,
          context: {
            chatId: string;
            authorId?: string;
            authorUsername?: string;
            isFromOwner: boolean;
            conversationHistory: Message[];
            messageId?: number;
            logContext: LogContext;
          }
        ) =>
          Effect.gen(function* () {
            yield* logger.info(
              context.logContext,
              "NearAiService",
              "generateResponse",
              "Generating AI response",
              {
                chatId: context.chatId,
                username: context.authorUsername,
                isOwner: context.isFromOwner,
              }
            );

            const queryEmbedding = yield* embeddingsService.generateEmbedding(message);

            const relevantMemories = yield* databaseService.searchMessagesByEmbedding(
              queryEmbedding,
              5
            );

            const memoryContext = relevantMemories.length > 0
              ? `\n\nRelevant past conversations:\n${relevantMemories
                .map(m => `${m.authorUsername || 'User'}: ${m.content}`)
                .join('\n')}`
              : '';

            if (relevantMemories.length > 0) {
              yield* logger.debug(
                context.logContext,
                "NearAiService",
                "generateResponse",
                "Memory search completed",
                {
                  relevantMessages: relevantMemories.length,
                  embeddingDimensions: queryEmbedding.length,
                }
              );
            }

            let graphContext = '';
            if (context.authorUsername) {
              const authorPersonaResult = yield* Effect.tryPromise({
                try: async () => {
                  const allPersonas = await Effect.runPromise(databaseService.getAllPersonas());
                  return allPersonas.find(p =>
                    p.displayName?.toLowerCase() === context.authorUsername?.toLowerCase()
                  );
                },
                catch: () => null
              });

              if (authorPersonaResult?.id) {
                const nodeInfo = yield* knowledgeGraphService.getNodeInfo('persona', authorPersonaResult.id).pipe(
                  Effect.catchAll(() => Effect.succeed(''))
                );

                if (nodeInfo) {
                  graphContext = `\n\nKnown relationships: ${nodeInfo}`;
                  yield* logger.debug(
                    context.logContext,
                    "NearAiService",
                    "generateResponse",
                    "Knowledge graph context added",
                    {
                      personaId: authorPersonaResult.id,
                      contextPreview: nodeInfo.slice(0, 100),
                    }
                  );
                }
              }
            }

            const toolSystemPrompt = `

IMPORTANT: When users mention people, projects, or relationships in conversations:
- Use create_persona to record people you learn about
- Use create_entity to record projects, organizations, or DAOs
- Use create_relationship to record connections between people and projects
- Always confirm what you've learned by mentioning it in your response

Examples:
- "I work on Everything" → create_persona for the person, create_entity for Everything, create_relationship
- "Elliot founded Everything" → create_persona for Elliot, create_entity for Everything, create_relationship with predicate "founded"
- "The team includes Alice and Bob" → create personas for Alice and Bob, create relationships with "member_of"`;

            const systemPrompt = STATIC_SYSTEM_PROMPT +
              buildOwnerContext(context.isFromOwner) +
              memoryContext +
              graphContext +
              toolSystemPrompt;

            const recentMessages = context.conversationHistory.map((msg: Message) => ({
              role: (msg.authorId === 'bot' ? 'assistant' : 'user') as 'assistant' | 'user',
              content: msg.content
            }));

            const toolResults: ToolResult[] = [];

            const tools = {
              create_persona: tool({
                description: 'Create or update a person in the knowledge graph. Use this when learning about people from conversations.',
                inputSchema: CreatePersonaParamsSchema,
                execute: async ({ displayName, nearAccount, personaType }) => {
                  const result = await Effect.runPromise(
                    Effect.gen(function* () {
                      const personaId = yield* databaseService.findOrCreatePersona(displayName, nearAccount, personaType);
                      yield* logger.info(
                        context.logContext,
                        "NearAiService",
                        "create_persona",
                        "Created/found persona",
                        { displayName, nearAccount, personaType, personaId }
                      );
                      return { success: true as const, personaId, displayName };
                    }).pipe(
                      Effect.catchAll((error) =>
                        Effect.succeed({ success: false as const, error: String(error) })
                      )
                    )
                  );
                  toolResults.push({ toolName: "create_persona", success: result.success, result });
                  return result;
                },
              }),
              create_entity: tool({
                description: 'Create or update a project, organization, or DAO in the knowledge graph. Use this when learning about projects/orgs.',
                inputSchema: CreateEntityParamsSchema,
                execute: async ({ name, nearAccount, entityType }) => {
                  const result = await Effect.runPromise(
                    Effect.gen(function* () {
                      const entityId = yield* databaseService.findOrCreateEntity(name, nearAccount, entityType);
                      yield* logger.info(
                        context.logContext,
                        "NearAiService",
                        "create_entity",
                        "Created/found entity",
                        { name, nearAccount, entityType, entityId }
                      );
                      return { success: true as const, entityId, name };
                    }).pipe(
                      Effect.catchAll((error) =>
                        Effect.succeed({ success: false as const, error: String(error) })
                      )
                    )
                  );
                  toolResults.push({ toolName: "create_entity", success: result.success, result });
                  return result;
                },
              }),
              create_relationship: tool({
                description: 'Create a relationship between two entities or people. Use this to record connections like "works on", "founded", "collaborates with".',
                inputSchema: CreateRelationshipParamsSchema,
                execute: async ({ subjectName, subjectType, predicate, objectName, objectType, context: relContext }) => {
                  const result = await Effect.runPromise(
                    Effect.gen(function* () {
                      let subjectId: number;
                      let objectId: number;

                      if (subjectType === 'person') {
                        subjectId = yield* databaseService.findOrCreatePersona(subjectName, undefined, 'human');
                      } else {
                        subjectId = yield* databaseService.findOrCreateEntity(subjectName, undefined, 'project');
                      }

                      if (objectType === 'person') {
                        objectId = yield* databaseService.findOrCreatePersona(objectName, undefined, 'human');
                      } else {
                        objectId = yield* databaseService.findOrCreateEntity(objectName, undefined, 'project');
                      }

                      const relationshipId = yield* databaseService.insertRelationship({
                        subjectType,
                        subjectId,
                        predicate,
                        objectType,
                        objectId,
                        context: relContext || null,
                        confidenceScore: 0.8,
                        sourceMessageId: context.messageId || null,
                      });

                      yield* logger.info(
                        context.logContext,
                        "NearAiService",
                        "create_relationship",
                        "Created relationship",
                        {
                          subject: subjectName,
                          predicate,
                          object: objectName,
                          relationshipId,
                        }
                      );

                      const relationship = `${subjectName} ${predicate} ${objectName}`;
                      return { success: true as const, relationshipId, relationship };
                    }).pipe(
                      Effect.catchAll((error) =>
                        Effect.succeed({ success: false as const, error: String(error) })
                      )
                    )
                  );
                  toolResults.push({ toolName: "create_relationship", success: result.success, result });
                  return result;
                },
              }),
            };

            const { text, toolCalls } = yield* Effect.tryPromise({
              try: async () => {
                return await generateText({
                  model: nearai('deepseek-v3.1'),
                  messages: [
                    { role: 'system', content: systemPrompt },
                    ...recentMessages,
                    { role: 'user', content: message }
                  ],
                  tools,
                  maxOutputTokens: 500,
                  temperature: 0.7,
                });
              },
              catch: (error) => new Error(`NEAR AI generation failed: ${error instanceof Error ? error.message : String(error)}`)
            });

            if (toolCalls && toolCalls.length > 0) {
              yield* logger.info(
                context.logContext,
                "NearAiService",
                "generateResponse",
                "Tools executed",
                {
                  toolCount: toolCalls.length,
                  tools: toolCalls.map(tc => tc.toolName),
                }
              );
            }

            let finalResponse = text;

            if (toolCalls && toolCalls.length > 0 && (!text || text.trim().length === 0)) {
              finalResponse = formatToolRecap(toolResults);
              yield* logger.info(
                context.logContext,
                "NearAiService",
                "generateResponse",
                "Generated tool recap (no text response from model)",
                { recapLength: finalResponse.length }
              );
            }

            yield* logger.info(
              context.logContext,
              "NearAiService",
              "generateResponse",
              "AI response generated",
              {
                model: "deepseek-v3.1",
                responseLength: finalResponse.length,
                toolsUsed: toolCalls?.length || 0,
              }
            );

            return finalResponse;
          })
      };
    })
  }
) { }
