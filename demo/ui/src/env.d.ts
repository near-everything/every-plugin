/// <reference types="@rsbuild/core/types" />

interface ImportMetaEnv {
  readonly PUBLIC_ACCOUNT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface RuntimeConfig {
  env: string;
  title: string;
  hostUrl: string;
  ui: {
    name: string;
    url: string;
  };
  apiBase: string;
  rpcBase: string;
}

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: RuntimeConfig;
  }
}

export {};
