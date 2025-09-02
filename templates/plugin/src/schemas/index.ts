import {
	createConfigSchema,
	createInputSchema,
	createOutputSchema,
} from "every-plugin";
import { z } from "zod";

// Config schema with variables and secrets
export const TemplateConfigSchema = createConfigSchema(
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

// Input schema
export const TemplateInputSchema = createInputSchema(
	z.object({
		query: z.string(),
		options: z
			.object({
				limit: z.number().optional(),
			})
			.optional(),
	}),
);

// Output schema
export const TemplateOutputSchema = createOutputSchema(
	z.object({
		results: z.array(
			z.object({
				id: z.string(),
				content: z.string(),
			}),
		),
		count: z.number(),
	}),
);

// Derived types
export type TemplateConfig = z.infer<typeof TemplateConfigSchema>;
export type TemplateInput = z.infer<typeof TemplateInputSchema>;
export type TemplateOutput = z.infer<typeof TemplateOutputSchema>;
