import { Effect, Queue, Ref, Stream } from "every-plugin/effect";
import type { Context } from "telegraf";
import { Telegraf } from "telegraf";
import type { Update } from "telegraf/types";

const MAX_QUEUE_SIZE = 1000;
const POLLING_TIMEOUT = 30;
const MAX_UPDATES_PER_POLL = 100;

function handleTelegramError(
	error: unknown,
	errors: {
		UNAUTHORIZED: (error: { message: string; data?: any }) => never;
		FORBIDDEN: (error: { message: string; data?: any }) => never;
		BAD_REQUEST: (error: { message: string; data?: any }) => never;
		NOT_FOUND: (error: { message: string; data?: any }) => never;
		SERVICE_UNAVAILABLE: (error: { message: string; data?: any }) => never;
	},
): never {
	if (error instanceof Error) {
		const message = error.message.toLowerCase();

		if (message.includes("unauthorized") || message.includes("401")) {
			throw errors.UNAUTHORIZED({
				message: "Invalid bot token",
				data: { provider: "telegram", botTokenProvided: true },
			});
		}

		if (message.includes("forbidden") || message.includes("403")) {
			throw errors.FORBIDDEN({
				message: "Bot lacks necessary permissions",
				data: { provider: "telegram" },
			});
		}

		if (message.includes("bad request") || message.includes("400")) {
			throw errors.BAD_REQUEST({
				message: "Invalid request parameters",
				data: { provider: "telegram" },
			});
		}

		if (message.includes("not found") || message.includes("404")) {
			throw errors.NOT_FOUND({
				message: "Chat or resource not found",
				data: { provider: "telegram" },
			});
		}

		if (message.includes("too many requests") || message.includes("429")) {
			throw errors.SERVICE_UNAVAILABLE({
				message: "Rate limited by Telegram API",
				data: { provider: "telegram", retryAfter: 30 },
			});
		}
	}

	throw errors.SERVICE_UNAVAILABLE({
		message:
			error instanceof Error ? error.message : "Unknown Telegram API error",
		data: { provider: "telegram" },
	});
}

/**
 * Telegram Service - Wraps Telegraf bot operations with Effect-based error handling.
 */
export class TelegramService {
	constructor(
		private readonly botToken: string,
		private readonly domain?: string,
		private readonly webhookToken?: string,
		private readonly timeout: number = 30000,
	) {}

	createBot() {
		const botToken = this.botToken;
		return Effect.gen(function* () {
			const bot = new Telegraf(botToken);

			// Validate bot token
			yield* Effect.tryPromise({
				try: () => bot.telegram.getMe(),
				catch: (error: unknown) =>
					new Error(
						`Bot token validation failed: ${error instanceof Error ? error.message : String(error)}`,
					),
			});

			return bot;
		});
	}

	createQueue() {
		return Effect.acquireRelease(
			Queue.bounded<Context<Update>>(MAX_QUEUE_SIZE),
			(q) => Queue.shutdown(q),
		);
	}

	setupWebhook(bot: Telegraf) {
		const domain = this.domain;
		const webhookToken = this.webhookToken;
		return Effect.gen(function* () {
			if (!domain) {
				return;
			}

			const webhookUrl = `${domain}/telegram/webhook`;

			yield* Effect.tryPromise({
				try: () =>
					bot.telegram.setWebhook(webhookUrl, {
						secret_token: webhookToken,
					}),
				catch: (error) =>
					new Error(
						`Webhook registration failed: ${error instanceof Error ? error.message : String(error)}`,
					),
			});

			yield* Effect.sync(() =>
				console.log(`[Telegram] Webhook registered: ${webhookUrl}`),
			);
		});
	}

	clearWebhook(bot: Telegraf, ignoreErrors = true) {
		const effect = Effect.tryPromise({
			try: () => bot.telegram.deleteWebhook({ drop_pending_updates: false }),
			catch: (_error) => new Error("Failed to clear webhook"),
		});

		if (ignoreErrors) {
			return effect.pipe(Effect.catchAll(() => Effect.void));
		}
		return effect;
	}

	setupPollingMiddleware(bot: Telegraf, queue: Queue.Queue<Context<Update>>) {
		return Effect.gen(function* () {
			bot.use((ctx, next) => {
				const updateType = ctx.updateType;
				const chatId = ctx.chat?.id;
				const messageText =
					ctx.message && "text" in ctx.message ? ctx.message.text : "";
				const fromUser =
					ctx.from?.username || ctx.from?.first_name || "unknown";

				console.log(
					`📥 [Telegram] Update ${ctx.update.update_id}: ${updateType} from ${fromUser} in chat ${chatId}${messageText ? ` - "${messageText}"` : ""}`,
				);

				void Effect.runPromise(
					Queue.offer(queue, ctx).pipe(
						Effect.tap(() =>
							Effect.sync(() =>
								console.log(`📋 [Queue] Added context to queue`),
							),
						),
						Effect.tap(() =>
							Queue.size(queue).pipe(
								Effect.tap((size) =>
									Effect.sync(() =>
										console.log(`📋 [Queue] Current queue size: ${size}`),
									),
								),
							),
						),
						Effect.catchAll(() => Effect.void), // ignore enqueue failures
					),
				);

				return next();
			});

			// Add error handler for Telegraf
			bot.catch((err) => {
				console.error("[Telegram] Bot error:", err);
			});

			yield* Effect.sync(() =>
				console.log("[Telegram] Polling middleware setup complete"),
			);
		});
	}

	startPollingLoop(bot: Telegraf) {
		return Effect.gen(function* () {
			const offset = yield* Ref.make(0);

			yield* Effect.forkScoped(
				Effect.gen(function* () {
					console.log("[Telegram] Starting manual polling loop");

					while (true) {
						try {
							const currentOffset = yield* Ref.get(offset);

							const updates = yield* Effect.tryPromise(() =>
								bot.telegram.getUpdates(
									POLLING_TIMEOUT,
									MAX_UPDATES_PER_POLL,
									currentOffset,
									[
										"message",
										"edited_message",
										"channel_post",
										"edited_channel_post",
									],
								),
							).pipe(
								Effect.catchAll((error) => {
									console.error("[Telegram] Polling error:", error);
									return Effect.succeed([]);
								}),
							);

							for (const update of updates) {
								// Process update through Telegraf to trigger middleware
								yield* Effect.tryPromise(() => bot.handleUpdate(update)).pipe(
									Effect.catchAll((error) => {
										console.error(
											`[Telegram] Failed to handle update ${update.update_id}:`,
											error,
										);
										return Effect.void;
									}),
								);

								// Update offset to next update
								yield* Ref.set(offset, update.update_id + 1);
							}

							// Small delay if no updates to avoid hammering the API
							if (updates.length === 0) {
								yield* Effect.sleep("1 second");
							}
						} catch (error) {
							console.error("[Telegram] Polling loop error:", error);
							yield* Effect.sleep("5 seconds"); // Back off on error
						}
					}
				}),
			);

			yield* Effect.sync(() =>
				console.log("[Telegram] Manual polling started"),
			);
		});
	}

	processWebhookUpdate(bot: Telegraf, update: Update) {
		return Effect.tryPromise({
			try: async () => {
				await bot.handleUpdate(update);
			},
			catch: (error) =>
				new Error(
					`Webhook processing failed: ${error instanceof Error ? error.message : String(error)}`,
				),
		}).pipe(
			Effect.catchAll((error) =>
				Effect.sync(() => {
					// Log the error but don't fail - malformed data should be handled gracefully
					console.error(
						`[Telegram] Webhook processing error: ${error.message}`,
					);
				}),
			),
		);
	}

	createListenStream(
		queue: Queue.Queue<Context<Update>>,
		input: {
			chatId?: string;
			maxResults?: number;
			messageTypes?: string[];
			chatTypes?: string[];
			commands?: string[];
			idleTimeout?: number;
		},
	) {
		return Effect.gen(function* () {
			const { chatId, maxResults, messageTypes, chatTypes, commands } = input;

			console.log(`🎧 [Listen] Starting listen maxResults: ${maxResults}`);

			// Create a blocking stream that takes from queue
			let stream = Stream.repeatEffect(Queue.take(queue));

			// Apply chatId filter
			if (chatId) {
				stream = stream.pipe(
					Stream.filter((ctx: Context<Update>) => {
						const id = ctx.chat?.id;
						return typeof id === "number" || typeof id === "bigint"
							? String(id) === chatId
							: false;
					}),
				);
			}

			// Apply chatTypes filter
			if (chatTypes && chatTypes.length > 0) {
				stream = stream.pipe(
					Stream.filter((ctx: Context<Update>) =>
						ctx.chat?.type ? chatTypes.includes(ctx.chat.type) : false,
					),
				);
			}

			// Apply messageTypes filter
			if (messageTypes && messageTypes.length > 0) {
				stream = stream.pipe(
					Stream.filter((ctx: Context<Update>) => {
						return messageTypes.some((type) => {
							switch (type) {
								case "text": {
									const isTextMessage = ctx.message && "text" in ctx.message;
									if (!isTextMessage) return false;

									const messageText = ctx.message.text || "";
									const isCommand = messageText.startsWith("/");

									// If commands are specified, allow commands through text filter
									if (commands && commands.length > 0) {
										return true;
									}

									// Otherwise, only allow non-command text messages
									return !isCommand;
								}
								case "photo":
									return ctx.message && "photo" in ctx.message;
								case "document":
									return ctx.message && "document" in ctx.message;
								case "video":
									return ctx.message && "video" in ctx.message;
								case "voice":
									return ctx.message && "voice" in ctx.message;
								case "audio":
									return ctx.message && "audio" in ctx.message;
								case "sticker":
									return ctx.message && "sticker" in ctx.message;
								case "location":
									return ctx.message && "location" in ctx.message;
								case "contact":
									return ctx.message && "contact" in ctx.message;
								case "animation":
									return ctx.message && "animation" in ctx.message;
								case "video_note":
									return ctx.message && "video_note" in ctx.message;
								default:
									return false;
							}
						});
					}),
				);
			}

			// Apply commands filter
			if (commands && commands.length > 0) {
				stream = stream.pipe(
					Stream.filter((ctx: Context<Update>) => {
						const messageText =
							ctx.message && "text" in ctx.message ? ctx.message.text : "";
						return (
							!!messageText &&
							commands.some((cmd) => messageText.startsWith(cmd))
						);
					}),
				);
			}

			// Apply limits (only when specified)
			if (maxResults) {
				stream = stream.pipe(Stream.take(maxResults));
			}

			// Final debugging before yielding
			stream = stream.pipe(
				Stream.tap((ctx: Context<Update>) =>
					Effect.sync(() =>
						console.log(
							`🔄 [Stream] Yielding context for chat ${ctx.chat?.id}, update ${ctx.update.update_id}`,
						),
					),
				),
			);

			return Stream.toAsyncIterable(stream);
		});
	}

	sendMessage(
		bot: Telegraf,
		input: {
			chatId: string;
			text: string;
			replyToMessageId?: number;
			parseMode?: "HTML" | "Markdown" | "MarkdownV2";
		},
		errors: {
			UNAUTHORIZED: (error: { message: string; data?: any }) => never;
			FORBIDDEN: (error: { message: string; data?: any }) => never;
			BAD_REQUEST: (error: { message: string; data?: any }) => never;
			NOT_FOUND: (error: { message: string; data?: any }) => never;
			SERVICE_UNAVAILABLE: (error: { message: string; data?: any }) => never;
		},
	) {
		return Effect.gen(function* () {
			const result = yield* Effect.tryPromise({
				try: () =>
					bot.telegram.sendMessage(input.chatId, input.text, {
						reply_parameters: input.replyToMessageId
							? { message_id: input.replyToMessageId }
							: undefined,
						parse_mode: input.parseMode,
					}),
				catch: (error) => handleTelegramError(error, errors),
			});

			return {
				messageId: result.message_id,
				success: true,
				chatId: input.chatId,
			};
		});
	}

	stopPolling(bot: Telegraf) {
		return Effect.try({
			try: () => bot.stop(),
			catch: (error) =>
				new Error(
					`Failed to stop polling: ${error instanceof Error ? error.message : String(error)}`,
				),
		});
	}
}
