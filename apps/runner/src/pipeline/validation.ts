import addFormats from "ajv-formats";
import Ajv2020, { type JSONSchemaType } from "ajv/dist/2020";
import { Effect } from "effect";
import { ValidationError } from "./errors";

const ajv = new Ajv2020({
  allErrors: true,
  verbose: true,
});
addFormats(ajv);

export class SchemaValidator {
  static validate(
    schema: JSONSchemaType<any>, // 2020-12
    data: Record<string, unknown>,
    context?: string
  ): Effect.Effect<Record<string, unknown>, ValidationError> {
    return Effect.gen(function* () {
      const validate = ajv.compile(schema);
      const valid = validate(data);

      if (!valid) {
        return yield* Effect.fail(new ValidationError({
          message: `${context || 'Unknown context'}: Schema validation failed`,
          cause: new Error(
            `${context || 'Unknown context'}: Validation failed\n` +
            `Expected: ${JSON.stringify(schema.properties || schema, null, 2)}\n` +
            `Received: ${JSON.stringify(data, null, 2)}\n` +
            `Details: ${ajv.errorsText(validate.errors)}`
          ),
          data: data,
          validationDetails: ajv.errorsText(validate.errors)
        }));
      }

      return data;
    });
  }
}
