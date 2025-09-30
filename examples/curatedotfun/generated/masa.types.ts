declare module "examples/curatedotfun/generated/masa.types" {
  import type { PluginBinding } from "every-plugin/runtime";
  import type { ContractRouterClient } from "@orpc/contract";
  import type { z } from "zod";

  // These are type aliases that your generator should emit based on the remote plugin.
  // For now, we assume you have embedded types from the plugin's contract and schemas.
  // Replace the “typeof ...” with actual inferred shapes when generating.

  // Config schema type (from remote plugin's MasaSourceConfigSchema)
  type MasaConfigSchema = z.ZodObject<{
    variables: z.ZodObject<{
      baseUrl: z.ZodOptional<z.ZodString>;
    }>;
    secrets: z.ZodObject<{
      apiKey: z.ZodString;
    }>;
  }>;

  // State schema type (from remote plugin's stateSchema)
  type MasaStateSchema = z.ZodObject<{
    phase: z.ZodString;
    mostRecentId: z.ZodOptional<z.ZodString>;
    oldestSeenId: z.ZodOptional<z.ZodString>;
    backfillDone: z.ZodOptional<z.ZodBoolean>;
    totalProcessed: z.ZodOptional<z.ZodNumber>;
    nextPollMs: z.ZodOptional<z.ZodNumber>;
  }>;

  // Contract type (from remote plugin's masaContract)
  type MasaContractType = {
    submitSearchJob: unknown; // Contract procedure definitions
    checkJobStatus: unknown;
    getJobResults: unknown;
    getById: unknown;
    getReplies: unknown;
    getBulk: unknown;
    similaritySearch: unknown;
    hybridSearch: unknown;
    getProfile: unknown;
    getTrends: unknown;
    search: unknown;
  };

  export type MasaBinding = PluginBinding<
    MasaContractType,
    MasaConfigSchema,
    MasaStateSchema
  >;

  // Contract type for creating a client (ContractRouterClient<MasaContract>)
  export type MasaContract = MasaContractType;
}
