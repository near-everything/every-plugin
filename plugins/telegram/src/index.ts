import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { z } from "every-plugin/zod";
import { contract } from "./contract";
import { TelegramService } from "./service";

/**
 * Telegram Plugin - Connect to Telegram Bot API for sending/receiving messages.
 *
 * Supports both polling and webhook modes:
 * - Polling: Continuously polls Telegram API for updates
 * - Webhook: Receives updates via HTTP webhook
 *
 */
export default createPlugin({
  id: "@curatedotfun/telegram",

  variables: z.object({
    domain: z.string().optional(), // Optional - if not provided, use polling mode
    timeout: z.number().default(30000),
  }),

  secrets: z.object({
    webhookToken: z.string().optional(),
    botToken: z.string().min(1, "Telegram bot token is required"),
  }),

  contract,

  initialize: (config) =>
    Effect.gen(function* () {
      // Create service instance with config
      const service = new TelegramService(
        config.secrets.botToken,
        config.variables.domain,
        config.secrets.webhookToken,
        config.variables.timeout
      );

      // Create bot and queue
      const bot = yield* service.createBot();
      const queue = yield* service.createQueue();

      // Setup appropriate mode (webhook or polling)
      if (config.variables.domain) {
        // Webhook mode
        yield* service.setupWebhook(bot);
        yield* service.setupPollingMiddleware(bot, queue);
      } else {
        // Polling mode
        yield* service.clearWebhook(bot);
        yield* service.setupPollingMiddleware(bot, queue);
        yield* service.startPollingLoop(bot);
      }

      return { service, bot, queue };
    }),

  shutdown: (context) =>
    Effect.gen(function* () {
      yield* context.service.clearWebhook(context.bot);
      yield* context.service.stopPolling(context.bot);
    }),

  createRouter: (context, builder) => {
    const { service, bot, queue } = context;

    const webhook = builder.webhook.handler(({ input }) =>
      Effect.runPromise(
        service.processWebhookUpdate(bot, input)
      ).then(() => ({ processed: true }))
    );

    const listen = builder.listen.handler(async function* ({ input }) {
      const iterable = await Effect.runPromise(
        service.createListenStream(queue, input)
      );

      for await (const item of iterable) {
        yield item;
      }
    });

    const sendMessage = builder.sendMessage.handler(async ({ input, errors }) => {
      const result = await Effect.runPromise(service.sendMessage(bot, input, errors as any));
      return result;
    });

    return {
      webhook,
      listen,
      sendMessage,
    };
  }
});
