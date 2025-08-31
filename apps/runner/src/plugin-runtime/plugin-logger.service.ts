import { Effect, Layer } from "effect";
import { PluginLoggerTag } from "every-plugin";

export const PluginLoggerLive = Layer.succeed(PluginLoggerTag, {
	logInfo: (message: string, context?: unknown) =>
		Effect.logInfo(message).pipe(
			Effect.annotateLogs({ source: "plugin", context }),
		),
	logWarning: (message: string, context?: unknown) =>
		Effect.logWarning(message).pipe(
			Effect.annotateLogs({ source: "plugin", context }),
		),
	logError: (message: string, error?: unknown, context?: unknown) =>
		Effect.logError(message, error).pipe(
			Effect.annotateLogs({ source: "plugin", error, context }),
		),
	logDebug: (message: string, context?: unknown) =>
		Effect.logDebug(message).pipe(
			Effect.annotateLogs({ source: "plugin", context }),
		),
});
