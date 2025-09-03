import { oc } from "@orpc/contract";
import { z } from "zod";
import { StateSchema } from "./schemas";

// Source item schema that plugins return
const sourceItemSchema = z.object({
	externalId: z.string(),
	content: z.string(),
	contentType: z.string().optional(),
	createdAt: z.string().optional(),
	url: z.string().optional(),
	authors: z.array(z.object({
		id: z.string().optional(),
		username: z.string().optional(),
		displayName: z.string().optional(),
		url: z.string().optional(),
	})).optional(),
	raw: z.unknown(), // Original API response
});

// Contract definition for the source plugin
export const sourceContract = {
	// Single item fetch by ID
	getById: oc
		.input(z.object({ 
			id: z.string() 
		}))
		.output(z.object({ 
			item: sourceItemSchema 
		})),

	// Streamable search operation
	search: oc
		.input(z.object({
			query: z.string(),
			limit: z.number().optional(),
			state: StateSchema
		}))
		.output(z.object({
			items: z.array(sourceItemSchema),
			nextState: StateSchema
		})),

	// Bulk fetch operation
	getBulk: oc
		.input(z.object({
			ids: z.array(z.string()),
		}))
		.output(z.object({
			items: z.array(sourceItemSchema),
		})),
};

// Export types for use in implementation
export type SourceContract = typeof sourceContract;
export type SourceItem = z.infer<typeof sourceItemSchema>;
