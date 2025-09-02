import { Effect } from "effect";
import type { PluginLogger } from "../plugin";

export const createTestLogger = (): PluginLogger => ({
	logInfo: (message: string, context?: unknown) => 
		Effect.sync(() => console.log(`[INFO] ${message}`, context || '')),
	
	logWarning: (message: string, context?: unknown) => 
		Effect.sync(() => console.warn(`[WARNING] ${message}`, context || '')),
	
	logError: (message: string, error?: unknown, context?: unknown) => 
		Effect.sync(() => console.error(`[ERROR] ${message}`, error, context || '')),
	
	logDebug: (message: string, context?: unknown) => 
		Effect.sync(() => console.log(`[DEBUG] ${message}`, context || '')),
});
