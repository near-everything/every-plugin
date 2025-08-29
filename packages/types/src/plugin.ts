import type { JSONSchemaType } from "ajv/dist/2020";
import { z } from 'zod';
import { Context, Effect } from "effect";
import type { ConfigurationError, PluginExecutionError } from "./errors";

// Helpers
export const createOutputSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    errors: z.array(ErrorDetailsSchema).optional(),
  });

export function createConfigSchema(): z.ZodObject<{
  variables: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  secrets: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}>;
export function createConfigSchema<V extends z.ZodTypeAny>(
  variablesSchema?: V
): z.ZodObject<{
  variables: z.ZodOptional<V>;
  secrets: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}>;
export function createConfigSchema<
  V extends z.ZodTypeAny,
  S extends z.ZodTypeAny
>(
  variablesSchema?: V,
  secretsSchema?: S
): z.ZodObject<{
  variables: z.ZodOptional<V>;
  secrets: z.ZodOptional<S>;
}>;
export function createConfigSchema<
  V extends z.ZodTypeAny = z.ZodRecord<z.ZodString, z.ZodUnknown>,
  S extends z.ZodTypeAny = z.ZodRecord<z.ZodString, z.ZodUnknown>
>(variablesSchema?: V, secretsSchema?: S) {
  return z.object({
    variables: (variablesSchema ?? z.record(z.string(), z.unknown())).optional(),
    secrets: (secretsSchema ?? z.record(z.string(), z.unknown())).optional(),
  });
}

export function createInputSchema<I extends z.ZodTypeAny>(
  inputSchema: I,
) {
  return inputSchema;
}

// Core schemas
export const ErrorDetailsSchema = z.object({
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
  stack: z.string().optional(),
});

export type ErrorDetails = z.infer<typeof ErrorDetailsSchema>;

export type Config<
  V extends z.ZodTypeAny = z.ZodRecord<z.ZodString, z.ZodUnknown>,
  S extends z.ZodTypeAny = z.ZodRecord<z.ZodString, z.ZodUnknown>
> = z.infer<ReturnType<typeof createConfigSchema<V, S>>>;

export type Input<
  I extends z.ZodTypeAny
> = z.infer<ReturnType<typeof createInputSchema<I>>>;

export type Output<T extends z.ZodTypeAny> = z.infer<
  ReturnType<typeof createOutputSchema<T>>
>;

// Plugin interface
export interface Plugin<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny,
  TConfigSchema extends z.ZodTypeAny,
> {
  readonly id: string;
  readonly type: PluginType;
  initialize(config?: z.infer<TConfigSchema>): Effect.Effect<void, ConfigurationError, PluginLoggerTag>;
  execute(input: z.infer<TInputSchema>): Effect.Effect<z.infer<TOutputSchema>, PluginExecutionError, PluginLoggerTag>;
  shutdown(): Effect.Effect<void, never, PluginLoggerTag>;
}

export type PluginType = "transformer" | "distributor" | "source";

export interface PluginMetadata {
  remoteUrl: string;
  type?: PluginType;
  configSchema: JSONSchemaType<any>;
  inputSchema: JSONSchemaType<any>;
  outputSchema: JSONSchemaType<any>;
  version?: string;
  description?: string;
}

export interface PluginRegistry {
  [pluginId: string]: PluginMetadata;
}

export interface PluginLogger {
  readonly logInfo: (message: string, context?: unknown) => Effect.Effect<void>;
  readonly logWarning: (message: string, context?: unknown) => Effect.Effect<void>;
  readonly logError: (message: string, error?: unknown, context?: unknown) => Effect.Effect<void>;
  readonly logDebug: (message: string, context?: unknown) => Effect.Effect<void>;
}

export class PluginLoggerTag extends Context.Tag("PluginLogger")<
  PluginLoggerTag,
  PluginLogger
>() {}