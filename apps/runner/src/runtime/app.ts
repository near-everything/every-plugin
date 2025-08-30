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
import {
	QueueClientLive,
	QueueServiceLive,
	QueueStatusServiceLive,
	RedisClientLive,
	StateServiceLive,
} from "../queue";
import { AuthServiceLive, HttpServerServiceLive } from "../services";

const LoggingLayer = Layer.mergeAll(
	BunTerminal.layer,
	Logger.pretty,
	Logger.minimumLogLevel(LogLevel.Debug),
);

const ConfigLayer = AppConfigLive.pipe(
	Layer.provide(Layer.setConfigProvider(ConfigProvider.fromEnv())),
);

const DatabaseLayer = DatabaseLive.pipe(Layer.provide(ConfigLayer));
const RedisLayer = RedisClientLive.pipe(Layer.provide(ConfigLayer));
const QueueClientLayer = QueueClientLive.pipe(Layer.provide(ConfigLayer));

const WorkflowLayer = WorkflowServiceLive.pipe(Layer.provide(DatabaseLayer));
const QueueLayer = QueueServiceLive.pipe(Layer.provide(QueueClientLayer));
const QueueStatusLayer = QueueStatusServiceLive.pipe(Layer.provide(RedisLayer));
const StateLayer = StateServiceLive.pipe(Layer.provide(RedisLayer));

const InfrastructureLayer = Layer.mergeAll(
	ConfigLayer,
	DatabaseLayer,
	RedisLayer,
	QueueClientLayer,
);

const AuthLayer = AuthServiceLive.pipe(Layer.provide(InfrastructureLayer));

const HttpLayer = HttpServerServiceLive.pipe(
	Layer.provide(Layer.mergeAll(InfrastructureLayer, AuthLayer)),
);

export const AppLayer = Layer.mergeAll(
	LoggingLayer,
	ConfigLayer,
	WorkflowLayer,
	QueueLayer,
	StateLayer,
	QueueStatusLayer,
	AuthLayer,
	HttpLayer,
).pipe(
	Layer.provide(InfrastructureLayer),
	Layer.orDie, // TODO: proper error handling
);

export const AppRuntime = ManagedRuntime.make(AppLayer);
