import { expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import { describe } from "vitest";
import type { PluginBinding } from "../../src/plugin";
import { createPluginRuntime } from "../../src/runtime";
import type TestPlugin from "../test-plugin/src/index";
import { TEST_REMOTE_ENTRY_URL } from "./global-setup";

type TestBindings = {
  "test-plugin": PluginBinding<typeof TestPlugin>;
};

const TEST_REGISTRY = {
  "test-plugin": {
    remoteUrl: TEST_REMOTE_ENTRY_URL,
    version: "0.0.1",
    description: "Real test plugin for background producer integration testing",
  },
} as const;

const BACKGROUND_CONFIG = {
  variables: {
    baseUrl: "http://localhost:1337",
    timeout: 5000,
    backgroundEnabled: true,
    backgroundIntervalMs: 200,
    backgroundMaxItems: 5,
  },
  secrets: {
    apiKey: "test-api-key-value",
  },
};

const SECRETS_CONFIG = {
  API_KEY: "test-api-key-value",
};

describe.sequential("Background Producer Integration Tests", () => {
  const runtime = createPluginRuntime<TestBindings>({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG
  });

  it.effect("should test background producer and consumer pattern", () =>
    Effect.gen(function* () {
      console.log("🚀 Testing background producer/consumer with real Module Federation");

      const { client } = yield* Effect.promise(() =>
        runtime.usePlugin("test-plugin", BACKGROUND_CONFIG)
      );

      console.log("✅ Plugin initialized with background producer enabled");

      // Ping to confirm basic connectivity
      const pingResult = yield* Effect.tryPromise(() =>
        client.ping()
      ).pipe(Effect.timeout("6 seconds"));

      console.log(`🏓 Ping successful: ${pingResult.ok} at ${pingResult.timestamp}`);
      expect(pingResult.ok).toBe(true);

      // Start consuming events immediately while producer is running
      console.log("🔄 Starting event consumption");

      const streamResult = yield* Effect.tryPromise(() =>
        client.listenBackground({ maxResults: 3 })
      );

      const stream = Stream.fromAsyncIterable(streamResult, (error) => {
        console.error("❌ Background stream error:", error);
        return error;
      });

      // Collect events as they arrive in real-time
      const events = yield* stream.pipe(
        Stream.tap((event) =>
          Effect.sync(() => {
            console.log(`🔍 Received background event in real-time: ${event.id} (index: ${event.index})`);
            expect(event.id).toMatch(/^bg-\d+$/);
            expect(event.index).toBeGreaterThan(0);
            expect(event.timestamp).toBeGreaterThan(0);
          })
        ),
        Stream.take(3),
        Stream.runCollect,
        Effect.timeout("5 seconds")
      );

      const eventArray = Array.from(events);
      console.log(`✅ Collected ${eventArray.length} background events in real-time`);
      expect(eventArray.length).toBe(3);

      // Verify sequential event IDs
      for (let i = 0; i < eventArray.length; i++) {
        const event = eventArray[i];
        expect(event.id).toBe(`bg-${i + 1}`);
        expect(event.index).toBe(i + 1);
        expect(typeof event.timestamp).toBe("number");
      }

      // Test manual enqueue and consumption
      console.log("🎯 Testing manual event enqueue and consumption");

      const enqueuePromise = Effect.tryPromise(() =>
        client.enqueueBackground({ id: "manual-test" })
      );

      const manualStreamPromise = Effect.tryPromise(() =>
        client.listenBackground({ maxResults: 1 })
      ).pipe(
        Effect.flatMap((streamResult) => {
          const stream = Stream.fromAsyncIterable(streamResult, (error) => error);
          return stream.pipe(Stream.take(1), Stream.runCollect);
        })
      );

      // Run enqueue and consume concurrently
      const [enqueueResult, manualEvents] = yield* Effect.all([
        enqueuePromise,
        manualStreamPromise
      ], { concurrency: "unbounded" }).pipe(
        Effect.timeout("4 seconds")
      );

      expect(enqueueResult.ok).toBe(true);
      console.log("✅ Manual enqueue successful");

      const manualEventArray = Array.from(manualEvents);
      expect(manualEventArray.length).toBe(1);
      const manualEvent = manualEventArray[0];
      expect(manualEvent.id).toBe("manual-test");
      expect(manualEvent.index).toBe(-1);
      console.log("✅ Manual event consumed in real-time");

      console.log("🎉 background producer/consumer test completed successfully!");
    }).pipe(Effect.timeout("15 seconds"))
    , { timeout: 20000 });
});
