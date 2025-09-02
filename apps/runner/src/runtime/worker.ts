import { BunTerminal } from "@effect/platform-bun";
import {
	ConfigProvider,
	Layer,
	Logger,
	LogLevel,
	ManagedRuntime,
} from "effect";
import { PluginRuntime } from "every-plugin/runtime";
import type { PluginRegistry } from "every-plugin";
import { AppConfigLive } from "../config";
import { DatabaseLive, WorkflowServiceLive } from "../db";
import {
	QueueClientLive,
	QueueServiceLive,
	QueueStatusServiceLive,
	RedisClientLive,
} from "../queue";
import registryData from "../plugin-runtime/registry.json" with { type: "json" };

// Logging for workers
const LoggingLayer = Layer.mergeAll(
	BunTerminal.layer,
	Logger.pretty,
	Logger.minimumLogLevel(LogLevel.Debug),
);

// Config from env
const ConfigLayer = AppConfigLive.pipe(
	Layer.provide(Layer.setConfigProvider(ConfigProvider.fromEnv())),
);

// Infra layers
const DatabaseLayer = DatabaseLive.pipe(Layer.provide(ConfigLayer));
const RedisLayer = RedisClientLive.pipe(Layer.provide(ConfigLayer));
const QueueClientLayer = QueueClientLive.pipe(Layer.provide(ConfigLayer));

// Base services needed by all workers
const WorkflowLayer = WorkflowServiceLive.pipe(Layer.provide(DatabaseLayer));
const QueueLayer = QueueServiceLive.pipe(Layer.provide(QueueClientLayer));
const QueueStatusLayer = QueueStatusServiceLive.pipe(Layer.provide(RedisLayer));

// Base infrastructure layers
const InfraLayer = Layer.mergeAll(
	ConfigLayer,
	DatabaseLayer,
	RedisLayer,
	QueueClientLayer,
);

// Create plugin runtime layer with registry and secrets
const PluginRuntimeLayer = PluginRuntime.Live({
	registry: registryData as PluginRegistry,
	secrets: {
		API_KEY: process.env.API_KEY || "",
		DATABASE_URL: process.env.DATABASE_URL || "",
		NOTION_TOKEN: process.env.NOTION_TOKEN || "",
		TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
		MASA_API_KEY: process.env.MASA_API_KEY || "",
	},
});

// Workers runtime with plugin execution capabilities
export const WorkersLayer = Layer.mergeAll(
	LoggingLayer,
	WorkflowLayer,
	QueueLayer,
	QueueStatusLayer,
	PluginRuntimeLayer,
).pipe(
	Layer.provide(InfraLayer),
	Layer.orDie, // Convert any config errors to defects to get 'never' error type
);

export const WorkersRuntime = ManagedRuntime.make(WorkersLayer);
