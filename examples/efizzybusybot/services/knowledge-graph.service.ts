import { Effect } from "every-plugin/effect";
import { DatabaseService } from "./db.service";
import type { Persona, Entity } from "../schemas/database";

export type GraphNode = 
  | { type: 'persona'; id: number; data: Persona }
  | { type: 'entity'; id: number; data: Entity };

export type GraphEdge = {
  predicate: string;
  context?: string;
  confidence: number;
};

export class KnowledgeGraphService extends Effect.Service<KnowledgeGraphService>()(
  "KnowledgeGraphService",
  {
    dependencies: [DatabaseService.Default],
    effect: Effect.gen(function* () {
      const db = yield* DatabaseService;

      return {
        getNeighbors: (nodeType: 'persona' | 'entity', nodeId: number) =>
          Effect.gen(function* () {
            const relationships = nodeType === 'persona'
              ? yield* db.getRelationshipsBySubject('persona', nodeId)
              : yield* db.getRelationshipsBySubject('entity', nodeId);

            const neighbors: Array<{ node: GraphNode; edge: GraphEdge }> = [];

            for (const rel of relationships) {
              if (rel.objectType === 'persona') {
                const persona = yield* db.getPersonaById(rel.objectId);
                if (persona) {
                  const neighborNode: GraphNode = { type: 'persona', id: persona.id, data: persona };
                  neighbors.push({
                    node: neighborNode,
                    edge: {
                      predicate: rel.predicate,
                      context: rel.context || undefined,
                      confidence: rel.confidenceScore || 0.5,
                    }
                  });
                }
              } else {
                const entity = yield* db.getEntityById(rel.objectId);
                if (entity) {
                  const neighborNode: GraphNode = { type: 'entity', id: entity.id, data: entity };
                  neighbors.push({
                    node: neighborNode,
                    edge: {
                      predicate: rel.predicate,
                      context: rel.context || undefined,
                      confidence: rel.confidenceScore || 0.5,
                    }
                  });
                }
              }
            }

            return neighbors;
          }),

        getNodeInfo: (nodeType: 'persona' | 'entity', nodeId: number) =>
          Effect.gen(function* () {
            if (nodeType === 'persona') {
              const persona = yield* db.getPersonaById(nodeId);
              if (!persona) return "Unknown persona";

              const relationships = yield* db.getRelationshipsBySubject('persona', nodeId);
              
              const relationshipTexts: string[] = [];
              for (const rel of relationships) {
                if (rel.objectType === 'persona') {
                  const targetPersona = yield* db.getPersonaById(rel.objectId);
                  if (targetPersona) {
                    relationshipTexts.push(`${rel.predicate} ${targetPersona.displayName}`);
                  }
                } else {
                  const targetEntity = yield* db.getEntityById(rel.objectId);
                  if (targetEntity) {
                    relationshipTexts.push(`${rel.predicate} ${targetEntity.name}`);
                  }
                }
              }

              return `${persona.displayName}${persona.nearAccount ? ` (${persona.nearAccount})` : ''}${relationshipTexts.length > 0 ? ` - ${relationshipTexts.join(', ')}` : ''}`;
            } else {
              const entity = yield* db.getEntityById(nodeId);
              if (!entity) return "Unknown entity";

              const relationships = yield* db.getRelationshipsBySubject('entity', nodeId);
              
              const relationshipTexts: string[] = [];
              for (const rel of relationships) {
                if (rel.objectType === 'persona') {
                  const targetPersona = yield* db.getPersonaById(rel.objectId);
                  if (targetPersona) {
                    relationshipTexts.push(`${rel.predicate} ${targetPersona.displayName}`);
                  }
                } else {
                  const targetEntity = yield* db.getEntityById(rel.objectId);
                  if (targetEntity) {
                    relationshipTexts.push(`${rel.predicate} ${targetEntity.name}`);
                  }
                }
              }

              return `${entity.name}${entity.nearAccount ? ` (${entity.nearAccount})` : ''}${relationshipTexts.length > 0 ? ` - ${relationshipTexts.join(', ')}` : ''}`;
            }
          }),
      };
    })
  }
) {}
