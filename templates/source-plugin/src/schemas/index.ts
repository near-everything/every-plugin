import { createConfigSchema, createSourceInputSchema, createSourceOutputSchema } from "every-plugin";
import { z } from "zod";
import { sourceContract } from "../contract";

// Config schema with variables and secrets
export const SourceTemplateConfigSchema = createConfigSchema(
	// Variables (non-sensitive config)
	z.object({
		baseUrl: z.string().url().optional(),
		timeout: z.number().optional(),
	}),
	// Secrets (sensitive config, hydrated at runtime)
	z.object({
		apiKey: z.string().min(1, "API key is required"),
		token: z.string().optional(),
		apiSecret: z.string().optional(),
	}),
);

// State schema for pagination (used in contract-based input generation)
export const StateSchema = z.object({
	page: z.number(),
}).nullable();

export const SourceTemplateInputSchema = createSourceInputSchema(sourceContract, StateSchema);
export const SourceTemplateOutputSchema = createSourceOutputSchema(sourceContract, StateSchema);

// Derived types
export type SourceTemplateConfig = z.infer<typeof SourceTemplateConfigSchema>;
export type SourceTemplateInput = z.infer<typeof SourceTemplateInputSchema>;
export type SourceTemplateOutput = z.infer<typeof SourceTemplateOutputSchema>;
