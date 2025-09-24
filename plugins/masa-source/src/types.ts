import type { masaContract, MasaSourceConfigSchema, stateSchema } from "./schemas";
import type { PluginBinding } from "every-plugin/runtime";

export type MasaBinding = PluginBinding<
  typeof masaContract,
  typeof MasaSourceConfigSchema
>;

export type MasaContract = typeof masaContract;
export type MasaConfig = typeof MasaSourceConfigSchema;
export type MasaState = typeof stateSchema;
