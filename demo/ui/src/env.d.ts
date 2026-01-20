/// <reference types="@rsbuild/core/types" />

interface RuntimeConfig {
  env: string;
  account: string;
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
