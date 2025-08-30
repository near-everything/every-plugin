import { ConfigProvider, Layer } from "effect";
import { EnvironmentServiceLive, EnvironmentServiceTag } from "./env.service";
import { ModuleFederationLive, ModuleFederationTag } from "./mf.service";
import { PluginServiceLive, PluginServiceTag } from "./plugin.service";
import { PluginLoggerLive } from "./plugin-logger.service";
import { SecretsConfigLive } from "./secrets.config";

const SecretsLayer = SecretsConfigLive.pipe(
	Layer.provide(Layer.setConfigProvider(ConfigProvider.fromEnv())),
);

const EnvironmentLayer = EnvironmentServiceLive.pipe(
	Layer.provide(SecretsLayer),
);

const PluginLayer = PluginServiceLive.pipe(
	Layer.provide(
		Layer.mergeAll(PluginLoggerLive, ModuleFederationLive, EnvironmentLayer),
	),
);

export const PluginRuntimeLive = Layer.mergeAll(
	SecretsLayer,
	PluginLoggerLive,
	ModuleFederationLive,
	EnvironmentLayer,
	PluginLayer,
);

export { PluginServiceTag, ModuleFederationTag, EnvironmentServiceTag };
