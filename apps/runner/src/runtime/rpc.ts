import { ConfigProvider, Layer, ManagedRuntime } from "effect";
import { AppConfigLive } from "../config";
import { DatabaseLive, WorkflowServiceLive } from "../db";
import {
	QueueClientLive,
	QueueServiceLive,
	QueueStatusServiceLive,
	RedisClientLive,
	StateServiceLive,
} from "../queue";

// Config from env
const ConfigLayer = AppConfigLive.pipe(
	Layer.provide(Layer.setConfigProvider(ConfigProvider.fromEnv())),
);

// Infra layers
const DatabaseLayer = DatabaseLive.pipe(Layer.provide(ConfigLayer));
const RedisLayer = RedisClientLive.pipe(Layer.provide(ConfigLayer));
const QueueClientLayer = QueueClientLive.pipe(Layer.provide(ConfigLayer));

// Service layers used by RPC routes
const WorkflowLayer = WorkflowServiceLive.pipe(Layer.provide(DatabaseLayer));
const QueueLayer = QueueServiceLive.pipe(Layer.provide(QueueClientLayer));
const QueueStatusLayer = QueueStatusServiceLive.pipe(Layer.provide(RedisLayer));
const StateLayer = StateServiceLive.pipe(Layer.provide(RedisLayer));

// Base infrastructure layers
const InfraLayer = Layer.mergeAll(
	ConfigLayer,
	DatabaseLayer,
	RedisLayer,
	QueueClientLayer,
);

// Only what routes need
export const ORPCServicesLayer = Layer.mergeAll(
	WorkflowLayer,
	QueueLayer,
	QueueStatusLayer,
	StateLayer,
).pipe(
	Layer.provide(InfraLayer),
	Layer.orDie, // Convert any config errors to defects to get 'never' error type
);

export const ORPCRuntime = ManagedRuntime.make(ORPCServicesLayer);
