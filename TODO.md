# Module Federation Manifest Improvements

## Current State Analysis

### ✅ What's Working
- **Manifest Generation**: Build system generates manifests (`enableManifest: true`)
- **Static Registry**: Comprehensive plugin registry with metadata, schemas, versions
- **Manual Registration**: Runtime manually registers remotes by pluginId/URL lookup
- **Shared Dependencies**: Proper shared config for effect, zod, oRPC packages, MF packages

### ❌ What's Missing
- **Manifest Consumption**: Generated manifests are never consumed by the runtime
- **Dynamic Discovery**: Can only load plugins pre-defined in static registry
- **Version Resolution**: MF manifest versioning capabilities are unused
- **Dependency Validation**: No validation of shared dependency compatibility

## Problems with Current Approach

1. **Double Maintenance**: Plugin metadata exists in both static registry AND generated manifests
2. **No Dynamic Discovery**: Can't discover new plugins without updating registry.json
3. **Manual URL Management**: URLs hardcoded in registry instead of using MF manifest discovery
4. **Limited Versioning**: Not leveraging MF's built-in version negotiation
5. **No Compatibility Checks**: Runtime doesn't validate if remote's shared deps are compatible

## Recommended Implementation: Hybrid Approach

Keep registry for critical metadata while using MF manifests for technical details.

### Phase 1: Add Manifest Consumption to ModuleFederationService

#### 1.1 Extend IModuleFederationService Interface
```typescript
export interface IModuleFederationService {
  // Existing methods...
  readonly fetchManifest: (
    manifestUrl: string,
  ) => Effect.Effect<ModuleFederationManifest, ModuleFederationError>;
  readonly validateRemoteCompatibility: (
    pluginId: string,
    manifest: ModuleFederationManifest,
  ) => Effect.Effect<boolean, ModuleFederationError>;
  readonly discoverRemoteFromManifest: (
    manifestUrl: string,
  ) => Effect.Effect<RemoteInfo, ModuleFederationError>;
}
```

#### 1.2 Add Manifest Types
```typescript
export interface ModuleFederationManifest {
  name: string;
  version?: string;
  remoteEntry: {
    name: string;
    type: string;
    url: string;
  };
  shared: Record<string, {
    version: string;
    scope: string;
    singleton?: boolean;
    requiredVersion?: string;
  }>;
  exposes: Record<string, {
    import: string;
    name: string;
  }>;
  metaData?: {
    name: string;
    type: string;
    buildInfo: {
      buildVersion: string;
      buildName: string;
    };
    types: {
      path: string;
      name: string;
      url: string;
      zip: string;
      api: string;
    };
    globalName: string;
    pluginVersion: string;
    publicPath: string;
  };
}

export interface RemoteInfo {
  pluginId: string;
  remoteEntryUrl: string;
  version: string;
  sharedDependencies: Record<string, string>;
  exposedModules: string[];
}
```

#### 1.3 Implement Manifest Methods
```typescript
fetchManifest: (manifestUrl: string) =>
  Effect.gen(function* () {
    const manifestResponse = yield* Effect.tryPromise({
      try: () => betterFetch(`${manifestUrl}/mf-manifest.json`),
      catch: (error): ModuleFederationError =>
        new ModuleFederationError({
          pluginId: "unknown",
          remoteUrl: manifestUrl,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    });

    if (!manifestResponse.ok) {
      return yield* Effect.fail(
        new ModuleFederationError({
          pluginId: "unknown",
          remoteUrl: manifestUrl,
          cause: new Error(`Failed to fetch manifest: ${manifestResponse.status}`),
        })
      );
    }

    const manifest = yield* Effect.tryPromise({
      try: () => manifestResponse.json() as Promise<ModuleFederationManifest>,
      catch: (error): ModuleFederationError =>
        new ModuleFederationError({
          pluginId: "unknown",
          remoteUrl: manifestUrl,
          cause: error instanceof Error ? error : new Error(String(error)),
        }),
    });

    return manifest;
  }),

validateRemoteCompatibility: (pluginId: string, manifest: ModuleFederationManifest) =>
  Effect.gen(function* () {
    const hostShared = {
      effect: "^3.17.0",
      zod: "^4.0.0",
      "@orpc/contract": "^1.8.0",
      "@orpc/server": "^1.8.0",
      "@module-federation/enhanced": "^0.18.0",
      "@module-federation/runtime-core": "^0.18.0",
    };

    // Check if remote's shared dependencies are compatible with host
    for (const [dep, remoteConfig] of Object.entries(manifest.shared)) {
      if (hostShared[dep]) {
        const hostVersion = hostShared[dep];
        const remoteVersion = remoteConfig.requiredVersion || remoteConfig.version;
        
        // Simple semver compatibility check (could be enhanced)
        if (!isVersionCompatible(hostVersion, remoteVersion)) {
          return yield* Effect.fail(
            new ModuleFederationError({
              pluginId,
              remoteUrl: manifest.remoteEntry.url,
              cause: new Error(
                `Incompatible shared dependency ${dep}: host requires ${hostVersion}, remote has ${remoteVersion}`
              ),
            })
          );
        }
      }
    }

    return true;
  }),
```

### Phase 2: Enhance Plugin Service with Manifest Support

#### 2.1 Update PluginService.loadPlugin
```typescript
const loadPluginImpl = (pluginId: string) =>
  Effect.gen(function* () {
    const metadata = registry[pluginId];
    if (!metadata) {
      return yield* Effect.fail(
        new PluginRuntimeError({
          pluginId,
          operation: "load-plugin",
          cause: new Error(`Plugin ${pluginId} not found in registry`),
          retryable: false,
        }),
      );
    }

    const url = resolveUrl(metadata.remoteUrl);

    // NEW: Fetch and validate manifest
    const manifestUrl = url.replace('/remoteEntry.js', '');
    const manifest = yield* moduleFederationService.fetchManifest(manifestUrl).pipe(
      Effect.catchAll(() => {
        // Fallback to registry-only approach if manifest not available
        logger.logWarning(`No manifest found for ${pluginId}, using registry data only`);
        return Effect.succeed(null);
      })
    );

    if (manifest) {
      // Validate compatibility
      yield* moduleFederationService.validateRemoteCompatibility(pluginId, manifest);
      
      // Use manifest data for more accurate registration
      const actualRemoteUrl = manifest.remoteEntry.url;
      yield* moduleFederationService.registerRemote(pluginId, actualRemoteUrl);
      
      const ctor = yield* moduleFederationService.loadRemoteConstructor(pluginId, actualRemoteUrl);
      
      return {
        ctor,
        metadata: {
          pluginId,
          version: manifest.version || metadata.version,
          description: metadata.description,
          type: metadata.type,
          manifestData: manifest, // Include manifest for future use
        },
      } satisfies PluginConstructor;
    } else {
      // Fallback to original approach
      yield* moduleFederationService.registerRemote(pluginId, url);
      const ctor = yield* moduleFederationService.loadRemoteConstructor(pluginId, url);
      
      return {
        ctor,
        metadata: {
          pluginId,
          version: metadata.version,
          description: metadata.description,
          type: metadata.type,
        },
      } satisfies PluginConstructor;
    }
  });
```

### Phase 3: Registry Enhancement with Manifest Discovery

#### 3.1 Add Manifest-Based Discovery Service
```typescript
export interface IPluginDiscoveryService {
  readonly discoverPluginsFromManifests: (
    manifestUrls: string[],
  ) => Effect.Effect<DiscoveredPlugin[], PluginRuntimeError>;
  readonly updateRegistryFromManifests: (
    discoveredPlugins: DiscoveredPlugin[],
  ) => Effect.Effect<PluginRegistry, PluginRuntimeError>;
}

export interface DiscoveredPlugin {
  pluginId: string;
  remoteUrl: string;
  version: string;
  manifest: ModuleFederationManifest;
  compatible: boolean;
}
```

#### 3.2 Enhanced Registry Structure
```typescript
export interface EnhancedPluginMetadata extends PluginMetadata {
  manifestUrl?: string;
  lastManifestCheck?: string;
  manifestVersion?: string;
  discoverySource: 'static' | 'manifest' | 'hybrid';
}
```

### Phase 4: Build System Enhancements

#### 4.1 Improve Manifest Generation
```typescript
// In build/index.ts, enhance manifest with plugin-specific metadata
const coreShared = {
  effect: {
    singleton: true,
    eager: false,
    requiredVersion: "^3.17.0", // Add explicit version requirements
  },
  zod: {
    singleton: true,
    eager: false,
    requiredVersion: "^4.0.0",
  },
  "@orpc/contract": {
    singleton: true,
    eager: false,
    requiredVersion: "^1.8.0",
  },
  "@orpc/server": {
    singleton: true,
    eager: false,
    requiredVersion: "^1.8.0",
  },
  // ... other shared deps
};
```

#### 4.2 Add Plugin Metadata to Manifest
```typescript
// Enhance pluginModuleFederation config
pluginModuleFederation({
  name: pluginInfo.normalizedName,
  filename: "remoteEntry.js",
  manifest: {
    fileName: "mf-manifest.json",
    // Add custom plugin metadata to manifest
    additionalData: {
      pluginId: pluginInfo.name,
      pluginVersion: pluginInfo.version,
      pluginType: getPluginTypeFromPackage(pluginInfo), // Infer from package.json
      buildTimestamp: new Date().toISOString(),
    },
  },
  exposes: {
    "./plugin": "./src/index.ts",
  },
  shared: getSharedDependencies(packageJsonPath, customShared),
  // ... rest of config
})
```

## Implementation Priority

1. **High Priority**: Phase 1 - Add manifest consumption to MF service
2. **Medium Priority**: Phase 2 - Enhance plugin service with manifest support
3. **Low Priority**: Phase 3 - Add discovery service for dynamic plugin detection
4. **Enhancement**: Phase 4 - Improve build system manifest generation

## Benefits After Implementation

1. **Automatic Version Resolution**: MF handles version compatibility automatically
2. **Dynamic Discovery**: Can discover new plugins without registry updates
3. **Better Error Messages**: Detailed compatibility error reporting
4. **Reduced Maintenance**: Single source of truth for technical plugin details
5. **Future-Proof**: Foundation for plugin marketplace and auto-updates

## Migration Strategy

1. **Backward Compatible**: Keep existing registry-based approach as fallback
2. **Gradual Rollout**: Enable manifest consumption per plugin
3. **Validation**: Compare manifest vs registry data for consistency
4. **Monitoring**: Log manifest fetch success/failure rates

## Files to Modify

- `packages/core/src/runtime/services/module-federation.service.ts`
- `packages/core/src/runtime/services/plugin.service.ts`
- `packages/core/src/runtime/types.ts`
- `packages/core/src/build/index.ts`
- `packages/registry/registry.json` (structure enhancement)
- New: `packages/core/src/runtime/services/plugin-discovery.service.ts`
