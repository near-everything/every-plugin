import { Data } from "effect";
import * as Zod from "zod";

export class DbError extends Data.TaggedError("DbError")<{
  readonly cause: unknown;
  readonly message?: string;
}> { }

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly errors: Zod.ZodError;
  readonly message: string;
}> { }