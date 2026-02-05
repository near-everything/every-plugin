/// <reference types="@rsbuild/core/types" />
import type { ClientRuntimeConfig } from "everything-dev/types";

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: ClientRuntimeConfig;
  }
}

export { };
