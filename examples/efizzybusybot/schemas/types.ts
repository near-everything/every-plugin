import { z } from "every-plugin/zod";

export const PersonaTypeSchema = z.enum(['human', 'ai']);
export const EntityTypeSchema = z.enum(['project', 'organization', 'dao']);
export const NodeTypeSchema = z.enum(['person', 'entity']);

export type PersonaType = z.infer<typeof PersonaTypeSchema>;
export type EntityType = z.infer<typeof EntityTypeSchema>;
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const CreatePersonaParamsSchema = z.object({
  displayName: z.string().describe('Full name or display name of the person'),
  nearAccount: z.string().optional().describe('NEAR account (e.g., "efiz.near")'),
  personaType: PersonaTypeSchema.describe('Type of persona'),
});

export const CreateEntityParamsSchema = z.object({
  name: z.string().describe('Name of the project, organization, or DAO'),
  nearAccount: z.string().optional().describe('NEAR account (e.g., "everything.sputnik-dao.near")'),
  entityType: EntityTypeSchema.describe('Type of entity'),
});

export const CreateRelationshipParamsSchema = z.object({
  subjectName: z.string().describe('Name of the subject (person or entity)'),
  subjectType: NodeTypeSchema.describe('Type of subject'),
  predicate: z.string().describe('Relationship type (e.g., "works_on", "founded", "collaborates_with", "member_of")'),
  objectName: z.string().describe('Name of the object (person or entity)'),
  objectType: NodeTypeSchema.describe('Type of object'),
  context: z.string().optional().describe('Additional context about this relationship'),
});

export type CreatePersonaParams = z.infer<typeof CreatePersonaParamsSchema>;
export type CreateEntityParams = z.infer<typeof CreateEntityParamsSchema>;
export type CreateRelationshipParams = z.infer<typeof CreateRelationshipParamsSchema>;
