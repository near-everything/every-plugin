import { TEST_REMOTE_ENTRY_URL } from "./setup/global-setup";
import type { TestPlugin } from "./fixtures/test-plugin/src/index";

export type TestRegistry = {
  "test-plugin": typeof TestPlugin;
};

export const TEST_REGISTRY = {
  "test-plugin": {
    remote: TEST_REMOTE_ENTRY_URL,
    description: "Real test plugin for background producer integration testing",
  },
} as const;
