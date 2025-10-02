import { Layer, ManagedRuntime } from "effect";
import { PluginRuntime } from "../runtime";
import {
	PluginLifecycleService,
	PluginLoaderService,
	PluginRegistryTag,
	PluginService,
	RegistryService,
	SecretsConfigTag,
	SecretsService
} from "../runtime/services";
import type { PluginRuntimeConfig, RegistryBindings } from "../types";
import { createMockModuleFederationServiceLayer, type TestPluginMap } from "./mocks/module-federation.service";

/**
 * Creates a test layer with mock ModuleFederationService for unit testing.
 * This mirrors PluginService.Live() but uses mock ModuleFederationService.
 */
export const createTestLayer = <R extends RegistryBindings = RegistryBindings>(
	config: PluginRuntimeConfig<R>,
	pluginMap: TestPluginMap
) => {
	const secrets = config.secrets || {};

	const contextLayer = Layer.mergeAll(
		Layer.succeed(PluginRegistryTag, config.registry),
		Layer.succeed(SecretsConfigTag, secrets),
	);

	const mockModuleFederationLayer = createMockModuleFederationServiceLayer(pluginMap);

	const servicesLayer = Layer.mergeAll(
		mockModuleFederationLayer,
		SecretsService.Default,
		RegistryService.Default,
		PluginLifecycleService.Default,
	).pipe(
		Layer.provide(contextLayer)
	);

	return PluginService.Default.pipe(
		Layer.provide(PluginLoaderService.Default),
		Layer.provide(servicesLayer)
	);
};

/**
 * Creates a test plugin runtime using mock services.
 * This mirrors createPluginRuntime exactly but uses test layer with mocks.
 */
export const createTestPluginRuntime = <R extends RegistryBindings = RegistryBindings>(
	config: PluginRuntimeConfig<R>,
	pluginMap: TestPluginMap
): PluginRuntime<R> => {
	const layer = createTestLayer<R>(config, pluginMap);
	const runtime = ManagedRuntime.make(layer);

	return new PluginRuntime<R>(runtime, config.registry);
};

// Re-export useful types for tests
export type { PluginRegistry, RegistryBindings } from "../types";
export type { PluginRuntimeConfig, TestPluginMap };
