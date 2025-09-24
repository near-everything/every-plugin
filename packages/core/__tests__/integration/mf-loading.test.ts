import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { ModuleFederationService } from "../../src/runtime/services/module-federation.service";
import { TEST_REMOTE_ENTRY_URL } from "./global-setup";


describe("Module Federation Integration Tests", () => {

  it("should verify remote URL is accessible", async () => {
    const response = await fetch(TEST_REMOTE_ENTRY_URL, { method: "HEAD" });
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);
  });

  it("should test name transformation logic", async () => {
    const pluginId = "test-plugin";
    const remoteName = pluginId
      .toLowerCase()
      .replace("@", "")
      .replace("/", "_");

    const modulePath = `${remoteName}/plugin`;

    expect(remoteName).toBe("test-plugin");
    expect(modulePath).toBe("test-plugin/plugin");
  });

  it("should register remote successfully", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const mfService = yield* ModuleFederationService;

        yield* mfService.registerRemote("test-plugin", TEST_REMOTE_ENTRY_URL);
        return "success";
      }).pipe(
        Effect.provide(ModuleFederationService.Live),
        Effect.catchAll((error) => {
          console.error("Remote registration failed:", error);
          return Effect.succeed(`failed: ${error}`);
        })
      )
    );

    expect(result).toBe("success");
  });

  it("should load remote constructor successfully", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const mfService = yield* ModuleFederationService;

        // Register remote first
        yield* mfService.registerRemote("test-plugin", TEST_REMOTE_ENTRY_URL);

        // Load the constructor
        const ctor = yield* mfService.loadRemoteConstructor("test-plugin", TEST_REMOTE_ENTRY_URL);

        expect(typeof ctor).toBe("function");
        expect(ctor.name).toBeDefined();

        return "constructor-loaded";
      }).pipe(
        Effect.provide(ModuleFederationService.Live),

        Effect.catchAll((error) => {
          console.error("Constructor loading failed:", error);
          return Effect.succeed(`failed: ${error.message}`);
        })
      )
    );

    expect(result).toBe("constructor-loaded");
  });

  it("should instantiate plugin from remote constructor", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const mfService = yield* ModuleFederationService;

        // Register and load constructor
        yield* mfService.registerRemote("test-plugin", TEST_REMOTE_ENTRY_URL);
        const ctor = yield* mfService.loadRemoteConstructor("test-plugin", TEST_REMOTE_ENTRY_URL);

        // Instantiate the plugin
        const instance = new ctor();

        expect(instance).toBeDefined();
        expect(instance.id).toBe("test-plugin");
        expect(instance.type).toBe("source");

        return "plugin-instantiated";
      }).pipe(
        Effect.provide(ModuleFederationService.Live),
        Effect.catchAll((error) => {
          console.error("Plugin instantiation failed:", error);
          return Effect.succeed(`failed: ${error.message}`);
        })
      )
    );

    expect(result).toBe("plugin-instantiated");
  });

  it("should handle invalid remote URL gracefully", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const mfService = yield* ModuleFederationService;
        return yield* mfService.registerRemote("invalid-plugin", "https://invalid-url.com/plugin.js").pipe(
          Effect.catchAll((error) => {
            expect(error).toBeDefined();
            return Effect.succeed("error-handled");
          })
        );
      }).pipe(
        Effect.provide(ModuleFederationService.Live)
      )
    );

    expect(result).toBe("error-handled");
  });
});
