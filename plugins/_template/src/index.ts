import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { implement } from "every-plugin/orpc";
import { z } from "every-plugin/zod";
import { contract } from "./contract";
import { TemplateService } from "./service";

/**
 * Template Plugin - Demonstrates core plugin patterns.
 *
 * Shows how to:
 * - Initialize a simple service
 * - Implement single fetch and streaming procedures
 * - Handle errors with CommonPluginErrors
 */
export default createPlugin({
  id: "@every-plugin/template",

  variables: z.object({
    baseUrl: z.string().url().default("https://api.example.com"),
    timeout: z.number().min(1000).max(60000).default(10000),
  }),

  secrets: z.object({
    apiKey: z.string().min(1, "API key is required"),
  }),

  contract, // START HERE: define your contract in ./contract

  initialize: (config) =>
    Effect.gen(function* () {
      // Create service instance with config
      const service = new TemplateService(
        config.variables.baseUrl,
        config.secrets.apiKey,
        config.variables.timeout
      );

      // Test the connection during initialization
      yield* service.ping();

      return { service }; // This is context for "createRouter"
    }),

  shutdown: () => Effect.void,

  createRouter: (context) => { // { service } from initialize
    const { service } = context;
    const os = implement(contract);

    const getById = os.getById.handler(async ({ input }) => {
      const item = await Effect.runPromise(service.getById(input.id));
      return { item };
    });

    const search = os.search.handler(async function* ({ input }) {
      const generator = await Effect.runPromise(
        service.search(input.query, input.limit)
      );

      for await (const result of generator) {
        yield result;
      }
    });

    const ping = os.ping.handler(async () => {
      return await Effect.runPromise(service.ping());
    });

    return os.router({
      getById,
      search,
      ping,
    });
  }
});
