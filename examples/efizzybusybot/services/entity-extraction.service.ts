import { Effect } from "every-plugin/effect";
import { generateObject } from "ai";
import { z } from "zod";
import { nearai } from "./nearai-provider";
import { DatabaseService } from "./db.service";

const NEAR_AI_API_KEY = Bun.env.NEAR_AI_API_KEY;

const ExtractionSchema = z.object({
  nearAccounts: z.array(z.object({
    account: z.string().describe("NEAR account name (e.g., 'jaytthew.near')"),
    associatedWith: z.string().optional().describe("Name of person or entity this account belongs to"),
    type: z.enum(['person', 'project', 'organization', 'dao']).describe("Type of entity"),
  })),
  relationships: z.array(z.object({
    subject: z.string().describe("Person or entity name (e.g., 'Jay')"),
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
    dependencies: [DatabaseService.Default],
    effect: Effect.gen(function* () {
      if (!NEAR_AI_API_KEY) {
        yield* Effect.die(new Error("NEAR_AI_API_KEY environment variable is required"));
      }

      const db = yield* DatabaseService;

      const extractFromMessage = (message: string): Effect.Effect<ExtractionResult, Error> =>
        Effect.gen(function* () {
          if (message.length < 10) {
            return { nearAccounts: [], relationships: [] };
          }

          const hasNearAccount = message.match(/\w+\.near/i);
          const hasRelationshipKeywords = /work|build|found|collaborate|member|develop|create|partner/i.test(message);

          if (!hasNearAccount && !hasRelationshipKeywords) {
            return { nearAccounts: [], relationships: [] };
          }

          yield* Effect.logDebug("🔍 Extracting entities and relationships").pipe(
            Effect.annotateLogs({ messageLength: message.length })
          );

          const result = yield* Effect.tryPromise({
            try: async () => {
              const { object } = await generateObject({
                model: nearai('deepseek-v3.1'),
                schema: ExtractionSchema,
                prompt: `Extract NEAR accounts and relationships from this message.

Message: "${message}"

Instructions:
- Identify any NEAR accounts (format: name.near)
- Identify relationships between people and projects/organizations
- Common predicates: works_on, founded, collaborates_with, member_of, leads, contributes_to
- Be precise and only extract explicitly stated information
- If nothing relevant is found, return empty arrays`,
                temperature: 0.3,
              });

              return object;
            },
            catch: (error) => new Error(`Entity extraction failed: ${error instanceof Error ? error.message : String(error)}`)
          });

          yield* Effect.logDebug("✅ Entity extraction completed").pipe(
            Effect.annotateLogs({ 
              nearAccounts: result.nearAccounts.length,
              relationships: result.relationships.length 
            })
          );

          return result;
        });

      return {
        extractFromMessage,

        processAndStore: (message: string, messageId: number) =>
          Effect.gen(function* () {
            const extracted = yield* extractFromMessage(message);

            for (const nearAccount of extracted.nearAccounts) {
              if (nearAccount.type === 'person' && nearAccount.associatedWith) {
                const personaId = yield* db.findOrCreatePersona(
                  nearAccount.associatedWith,
                  nearAccount.account,
                  'human'
                );

                yield* Effect.logDebug("👤 Created/found persona").pipe(
                  Effect.annotateLogs({ 
                    name: nearAccount.associatedWith,
                    nearAccount: nearAccount.account,
                    personaId 
                  })
                );
              } else if (nearAccount.type !== 'person') {
                const entityId = yield* db.findOrCreateEntity(
                  nearAccount.associatedWith || nearAccount.account,
                  nearAccount.account,
                  nearAccount.type
                );

                yield* Effect.logDebug("🏢 Created/found entity").pipe(
                  Effect.annotateLogs({ 
                    name: nearAccount.associatedWith || nearAccount.account,
                    nearAccount: nearAccount.account,
                    entityId 
                  })
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

              yield* Effect.logDebug("🔗 Created relationship").pipe(
                Effect.annotateLogs({ 
                  subject: rel.subject,
                  predicate: rel.predicate,
                  object: rel.object 
                })
              );
            }
          }),
        };
    })
  }
) {}
