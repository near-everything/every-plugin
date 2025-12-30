import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface BosConfig {
  account: string;
  app: {
    host: {
      title: string;
      description?: string;
      development: string;
      production: string;
    };
    ui: {
      name: string;
      development: string;
      production: string;
      ssr?: string;
      exposes: Record<string, string>;
    };
    api: {
      name: string;
      development: string;
      production: string;
      variables?: Record<string, any>;
      secrets?: string[];
    };
  };
}

export type SourceMode = 'local' | 'remote';

export interface RuntimeConfig {
  env: 'development' | 'production';
  account: string;
  title: string;
  hostUrl: string;
  ui: {
    name: string;
    url: string;
    ssrUrl?: string;
    source: SourceMode;
    exposes: Record<string, string>;
  };
  api: {
    name: string;
    url: string;
    source: SourceMode;
    proxy?: string;
    variables?: Record<string, any>;
    secrets?: string[];
  };
}

export type ClientRuntimeConfig =
  Pick<RuntimeConfig, 'env' | 'title' | 'hostUrl'> & {
    apiBase: string;
    rpcBase: string;
  };

export type WindowRuntimeConfig =
  Pick<RuntimeConfig, 'env' | 'title' | 'hostUrl'> & {
    ui: Pick<RuntimeConfig['ui'], 'name' | 'url' | 'exposes'>;
    apiBase: string;
    rpcBase: string;
  };

function resolveSource(envVar: string | undefined, env: string): SourceMode {
  if (envVar === 'local' || envVar === 'remote') return envVar;
  return env === 'production' ? 'remote' : 'local';
}

export async function loadBosConfig(): Promise<RuntimeConfig> {
  const env = (process.env.NODE_ENV as 'development' | 'production') || 'development';
  const path = process.env.BOS_CONFIG_PATH ?? resolve(process.cwd(), 'bos.config.json');

  const raw = await readFile(path, 'utf8');
  const config = JSON.parse(raw) as BosConfig;

  const uiSource = resolveSource(process.env.UI_SOURCE, env);
  const apiSource = resolveSource(process.env.API_SOURCE, env);
  
  const apiProxyEnv = process.env.API_PROXY;
  const apiProxy = apiProxyEnv === 'true' 
    ? config.app.host.production 
    : apiProxyEnv || undefined;

  const uiUrl = uiSource === 'remote' 
    ? config.app.ui.production 
    : config.app.ui.development;

  const apiUrl = apiSource === 'remote'
    ? config.app.api.production
    : config.app.api.development;

  const ssrUrl = uiSource === 'remote' && config.app.ui.ssr
    ? config.app.ui.ssr
    : undefined;

  return {
    env,
    account: config.account,
    title: config.app.host.title,
    hostUrl: config.app.host[env],
    ui: {
      name: config.app.ui.name,
      url: uiUrl,
      ssrUrl,
      source: uiSource,
      exposes: config.app.ui.exposes,
    },
    api: {
      name: config.app.api.name,
      url: apiUrl,
      source: apiSource,
      proxy: apiProxy,
      variables: config.app.api.variables,
      secrets: config.app.api.secrets,
    },
  };
}
