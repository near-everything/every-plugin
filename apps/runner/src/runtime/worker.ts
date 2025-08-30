import { BunTerminal } from "@effect/platform-bun";
import {
	ConfigProvider,
	Layer,
	Logger,
	LogLevel,
	ManagedRuntime,
} from "effect";
import { AppConfigLive } from "../config";
import { DatabaseLive, WorkflowServiceLive } from "../db";
import { PluginRuntimeLive } from "../plugin-runtime";
import {
	QueueClientLive,
	QueueServiceLive,
	QueueStatusServiceLive,
	RedisClientLive,
} from "../queue";

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

// Workers runtime with plugin execution capabilities
export const WorkersLayer = Layer.mergeAll(
	LoggingLayer,
	WorkflowLayer,
	QueueLayer,
	QueueStatusLayer,
	PluginRuntimeLive,
).pipe(
	Layer.provide(InfraLayer),
	Layer.orDie, // Convert any config errors to defects to get 'never' error type
);

export const WorkersRuntime = ManagedRuntime.make(WorkersLayer);
