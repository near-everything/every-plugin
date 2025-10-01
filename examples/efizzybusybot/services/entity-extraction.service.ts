import { generateObject } from "ai";
import { Effect } from "every-plugin/effect";
import { z } from "zod";
import { DatabaseService } from "./db.service";
import type { LogContext } from "./logger.service";
import { LoggerService } from "./logger.service";
import { nearai } from "./nearai-provider";

const NEAR_AI_API_KEY = Bun.env.NEAR_AI_API_KEY;

const ExtractionSchema = z.object({
  nearAccounts: z.array(z.object({
    account: z.string().describe("NEAR account name (e.g., 'efiz.near')"),
    associatedWith: z.string().optional().describe("Name of person or entity this account belongs to"),
    type: z.enum(['person', 'project', 'organization', 'dao']).describe("Type of entity"),
  })),
  relationships: z.array(z.object({
    subject: z.string().describe("Person or entity name (e.g., 'Elliot')"),
    subjectType: z.enum(['person', 'entity']),
    predicate: z.string().describe("Relationship type (e.g., 'works_on', 'founded', 'collaborates_with')"),
    object: z.string().describe("Person or entity name"),
    objectType: z.enum(['person', 'entity']),
    context: z.string().optional().describe("Additional context about the relationship"),
  })),
});

type ExtractionResult = z.infer<typeof ExtractionSchema>;

export class EntityExtractionService extends Effect.Service<EntityExtractionService>()(
  "EntityExtractionService",
  {
    dependencies: [DatabaseService.Default, LoggerService.Default],
    effect: Effect.gen(function* () {
      if (!NEAR_AI_API_KEY) {
        yield* Effect.die(new Error("NEAR_AI_API_KEY environment variable is required"));
      }

      const db = yield* DatabaseService;
      const logger = yield* LoggerService;

      const extractFromMessage = (message: string, logContext: LogContext): Effect.Effect<ExtractionResult, Error> =>
        Effect.gen(function* () {
          if (message.length < 10) {
            return { nearAccounts: [], relationships: [] };
          }

          const hasNearAccount = message.match(/\w+\.near/i);
          const hasMention = message.match(/@\w+/);
          const hasRelationshipKeywords = /work|build|found|collaborate|member|develop|create|partner|team/i.test(message);

          if (!hasNearAccount && !hasMention && !hasRelationshipKeywords) {
            return { nearAccounts: [], relationships: [] };
          }

          yield* logger.info(
            logContext,
            "EntityExtractionService",
            "extractFromMessage",
            "Extracting entities and relationships",
            { messageLength: message.length }
          );

          const result = yield* Effect.tryPromise({
            try: async () => {
              const { object } = await generateObject({
                model: nearai('deepseek-v3.1'),
                schema: ExtractionSchema,
                prompt: `Extract NEAR accounts, projects, people, and their relationships from this message.

Message: "${message}"

CRITICAL Instructions:
1. Extract NEAR accounts in ANY format:
   - Full format: "name.near" 
   - Shorthand: "crosspost.near" mentioned as just "crosspost"
   - In parentheses: "(crosspost.near)"
   
2. Extract people mentioned by:
   - Telegram handles: @username
   - Names: "Elliot", "John Smith"
   - With NEAR accounts: "efiz.near" or "efiz"
   
3. Extract projects/organizations:
   - With handles: @open_crosspost
   - Project names: "Open Crosspost"
   - DAO names, organization names
   
4. Identify ALL relationships:
   - Team membership: "X works on Y", "X is on Y team", "team members: A, B, C"
   - Leadership: "X founded Y", "X leads Y"
   - Collaboration: "X collaborates with Y"
   - For team lists, create relationship for EACH member
   
5. BE AGGRESSIVE in extraction:
   - If someone mentions a project and people in same sentence, assume relationship
   - "my project X with teammates A, B" = create relationships for A and B to X
   - Team lists = each person works_on the project

Return empty arrays ONLY if truly nothing is mentioned.`,
                temperature: 0.3,
              });

              return object;
            },
            catch: (error) => new Error(`Entity extraction failed: ${error instanceof Error ? error.message : String(error)}`)
          });

          yield* logger.info(
            logContext,
            "EntityExtractionService",
            "extractFromMessage",
            "Entity extraction completed",
            {
              nearAccounts: result.nearAccounts.length,
              relationships: result.relationships.length,
            }
          );

          return result;
        });

      return {
        extractFromMessage,

        processAndStore: (message: string, messageId: number, logContext: LogContext) =>
          Effect.gen(function* () {
            const extracted = yield* extractFromMessage(message, logContext);

            if (extracted.nearAccounts.length === 0 && extracted.relationships.length === 0) {
              yield* logger.debug(
                logContext,
                "EntityExtractionService",
                "processAndStore",
                "No entities or relationships extracted"
              );
              return;
            }

            for (const nearAccount of extracted.nearAccounts) {
              if (nearAccount.type === 'person') {
                const name = nearAccount.associatedWith || nearAccount.account.replace('.near', '');
                const personaId = yield* db.findOrCreatePersona(
                  name,
                  nearAccount.account,
                  'human'
                );

                yield* logger.info(
                  logContext,
                  "EntityExtractionService",
                  "processAndStore",
                  "Created/found persona",
                  {
                    name,
                    nearAccount: nearAccount.account,
                    personaId,
                  }
                );
              } else {
                const name = nearAccount.associatedWith || nearAccount.account.replace('.near', '');
                const entityId = yield* db.findOrCreateEntity(
                  name,
                  nearAccount.account,
                  nearAccount.type
                );

                yield* logger.info(
                  logContext,
                  "EntityExtractionService",
                  "processAndStore",
                  "Created/found entity",
                  {
                    name,
                    nearAccount: nearAccount.account,
                    type: nearAccount.type,
                    entityId,
                  }
                );
              }
            }

            for (const rel of extracted.relationships) {
              let subjectId: number;
              let objectId: number;

              if (rel.subjectType === 'person') {
                subjectId = yield* db.findOrCreatePersona(rel.subject, undefined, 'human');
              } else {
                subjectId = yield* db.findOrCreateEntity(rel.subject, undefined, 'project');
              }

              if (rel.objectType === 'person') {
                objectId = yield* db.findOrCreatePersona(rel.object, undefined, 'human');
              } else {
                objectId = yield* db.findOrCreateEntity(rel.object, undefined, 'project');
              }

              yield* db.insertRelationship({
                subjectType: rel.subjectType,
                subjectId,
                predicate: rel.predicate,
                objectType: rel.objectType,
                objectId,
                context: rel.context || null,
                confidenceScore: 0.7,
                sourceMessageId: messageId,
              });

              yield* logger.info(
                logContext,
                "EntityExtractionService",
                "processAndStore",
                "Created relationship",
                {
                  subject: rel.subject,
                  predicate: rel.predicate,
                  object: rel.object,
                }
              );
            }
          }),
      };
    })
  }
) { }
