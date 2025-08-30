import { Context } from "effect";
import type { StateService as RedisStateService } from "../queue";

export type StateService = RedisStateService;

export const StateServiceTag = Context.GenericTag<StateService>("StateService");
