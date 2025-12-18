import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

interface BosConfig {
  account: string;
  app: {
    host: {
      title: string;
      development: string;
      production: string;
    };
    ui: {
      name: string;
      development: string;
      production: string;
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

export interface RuntimeConfig {
  env: 'development' | 'production';
  account: string;
  title: string;
  hostUrl: string;
  ui: {
    name: string;
    url: string;
    exposes: Record<string, string>;
  };
  api: {
    name: string;
    url: string;
    variables?: Record<string, any>;
    secrets?: string[];
  };
}

export async function loadBosConfig(): Promise<RuntimeConfig> {
  const env = (process.env.NODE_ENV as 'development' | 'production') || 'development';

  const path = process.env.BOS_CONFIG_PATH ?? resolve(process.cwd(), 'bos.config.json');

  const raw = await readFile(path, 'utf8');
  const config = JSON.parse(raw) as BosConfig;

  const useRemoteApi = process.env.USE_REMOTE_API === 'true';
  const useRemoteUi = process.env.USE_REMOTE_UI === 'true';

  const api: RuntimeConfig['api'] = {
    name: config.app.api.name,
    url: useRemoteApi ? config.app.api.production : config.app.api[env],
    variables: config.app.api.variables,
    secrets: config.app.api.secrets,
  };

  return {
    env,
    account: config.account,
    title: config.app.host.title,
    hostUrl: config.app.host[env],
    ui: {
      name: config.app.ui.name,
      url: useRemoteUi ? config.app.ui.production : config.app.ui[env],
      exposes: config.app.ui.exposes,
    },
    api,
  };
}
