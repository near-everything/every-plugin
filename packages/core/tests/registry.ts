import { TEST_REMOTE_ENTRY_URL, TEST_REMOTE_ENTRY_URL_LEGACY } from "./setup/global-setup";
import type { TestPlugin } from "./fixtures/test-plugin/src/index";

export type TestRegistry = {
  "test-plugin": typeof TestPlugin;
};

export const TEST_REGISTRY = {
  "test-plugin": {
    remoteUrl: TEST_REMOTE_ENTRY_URL,
    version: "0.0.1",
    description: "Real test plugin for background producer integration testing",
  },
} as const;
