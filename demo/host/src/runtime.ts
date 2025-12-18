import { createPluginRuntime } from 'every-plugin';
import { loadBosConfig } from './config';

export interface PluginStatus {
  available: boolean;
  pluginName: string | null;
  error: string | null;
  errorDetails: string | null;
}

function secretsFromEnv(keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = process.env[k];
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

export interface PluginResult {
  runtime: ReturnType<typeof createPluginRuntime> | null;
  api: any | null;
  status: PluginStatus;
}

export async function initializePlugins(): Promise<PluginResult> {
  let pluginName: string | null = null;
  let pluginUrl: string | null = null;
  
  try {
    const config = await loadBosConfig();
    const pluginConfig = config.api;
    pluginName = pluginConfig.name;
    pluginUrl = pluginConfig.url;

    console.log(`[Plugins] Registering remote: ${pluginName} from ${pluginUrl}`);

    const runtime = createPluginRuntime({
      registry: {
        [pluginName]: {
          remote: pluginUrl,
        },
      },
      secrets: {},
    });

    const secrets = pluginConfig.secrets
      ? secretsFromEnv(pluginConfig.secrets)
      : {};
    const variables = pluginConfig.variables ?? {};

    const api = await runtime.usePlugin(pluginName, {
       // @ts-expect-error no plugin types loaded
      variables,
       // @ts-expect-error no plugin types loaded
      secrets,
    });

    return {
      runtime,
      api,
      status: {
        available: true,
        pluginName,
        error: null,
        errorDetails: null,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error('[Plugins] ❌ Failed to initialize plugin');
    
    if (errorMessage.includes('register-remote') || errorStack?.includes('register-remote')) {
      console.error(`[Plugins] Failed to register remote plugin: ${pluginName}`);
      console.error(`[Plugins] Remote URL: ${pluginUrl}`);
      console.error('[Plugins] Possible causes:');
      console.error('  • API server is not running at the configured URL');
      console.error('  • Wrong URL in bos.config.json');
      console.error('  • Network connectivity issue');
      console.error('  • CORS configuration problem');
      console.error(`[Plugins] Error: ${errorMessage}`);
    } else if (errorMessage.includes('validation') || errorMessage.includes('ZodError')) {
      console.error('[Plugins] Configuration validation failed');
      console.error('[Plugins] Check that all required secrets are set in your environment variables');
      console.error(`[Plugins] Error: ${errorMessage}`);
    } else if (errorMessage.includes('ENOTDIR') || errorMessage.includes('ENOENT')) {
      console.error('[Plugins] Plugin file not found - ensure API is running and built');
      console.error(`[Plugins] Attempted URL: ${pluginUrl}`);
      console.error(`[Plugins] Error: ${errorMessage}`);
    } else if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
      console.error('[Plugins] Network error - ensure API server is running at the configured URL');
      console.error(`[Plugins] URL: ${pluginUrl}`);
      console.error(`[Plugins] Error: ${errorMessage}`);
    } else {
      console.error(`[Plugins] Plugin: ${pluginName}`);
      console.error(`[Plugins] URL: ${pluginUrl}`);
      console.error(`[Plugins] Error: ${errorMessage}`);
    }
    
    console.warn('[Plugins] Server will continue without plugin functionality');

    return {
      runtime: null,
      api: null,
      status: {
        available: false,
        pluginName,
        error: errorMessage,
        errorDetails: errorStack ?? null,
      },
    };
  }
}

export type Plugins = Awaited<ReturnType<typeof initializePlugins>>;
