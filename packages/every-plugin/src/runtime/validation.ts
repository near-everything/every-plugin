import { Effect } from "effect";
import type { z } from "zod";
import { ValidationError } from "./errors";

export const validate = <T>(
	schema: z.ZodSchema<T>,
	data: unknown,
	pluginId: string,
	stage: "config" | "input" | "output" | "state",
): Effect.Effect<T, ValidationError> =>
	Effect.gen(function* () {
		const result = schema.safeParse(data);
		if (result.success) {
			return result.data;
		}
		return yield* Effect.fail(
			new ValidationError({
				pluginId,
				stage,
				zodError: result.error,
			}),
		);
	});
