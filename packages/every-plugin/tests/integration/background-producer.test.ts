import { expect, it } from "@effect/vitest";
import { Effect, Stream } from "effect";
import { createPluginRuntime } from "every-plugin/runtime";
import { describe } from "vitest";
import { TEST_REGISTRY } from "../registry";

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
  const runtime = createPluginRuntime({
    registry: TEST_REGISTRY,
    secrets: SECRETS_CONFIG
  });

  it.effect("should test background producer and consumer pattern", () =>
    Effect.gen(function* () {
      console.log("🚀 Testing background producer/consumer with real Module Federation");

      const { createClient } = yield* Effect.promise(() =>
        runtime.usePlugin("test-plugin", BACKGROUND_CONFIG)
      );

      const client = createClient();
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

      // Verify event structure and sequential ordering (real-time broadcasting)
      for (const event of eventArray) {
        expect(event.id).toMatch(/^bg-\d+$/);
        expect(event.index).toBeGreaterThan(0);
        expect(typeof event.timestamp).toBe("number");
        expect(event.timestamp).toBeLessThanOrEqual(Date.now());
      }

      // Verify sequential ordering
      for (let i = 1; i < eventArray.length; i++) {
        const prevEvent = eventArray[i - 1];
        const currEvent = eventArray[i];
        if (prevEvent && currEvent) {
          const prevId = parseInt(prevEvent.id.replace('bg-', ''), 10);
          const currId = parseInt(currEvent.id.replace('bg-', ''), 10);
          expect(currId).toBeGreaterThan(prevId);
        }
      }

      console.log("� background producer/consumer test completed successfully!");

      console.log("🎉 background producer/consumer test completed successfully!");
    }).pipe(Effect.timeout("15 seconds"))
    , { timeout: 20000 });

  it.effect("should handle multiple consumers simultaneously", () =>
    Effect.gen(function* () {
      console.log("🚀 Testing multiple consumers simultaneously");

      const { createClient } = yield* Effect.promise(() =>
        runtime.usePlugin("test-plugin", BACKGROUND_CONFIG)
      );

      const client = createClient();
      // Test multiple consumers reading from same publisher
      console.log("🔄 Starting multiple consumer streams");

      const consumer1 = Effect.tryPromise(() =>
        client.listenBackground({ maxResults: 3 })
      ).pipe(
        Effect.flatMap((streamResult) => {
          const stream = Stream.fromAsyncIterable(streamResult, (error) => error);
          return stream.pipe(Stream.take(3), Stream.runCollect);
        })
      );

      const consumer2 = Effect.tryPromise(() =>
        client.listenBackground({ maxResults: 2 })
      ).pipe(
        Effect.flatMap((streamResult) => {
          const stream = Stream.fromAsyncIterable(streamResult, (error) => error);
          return stream.pipe(Stream.take(2), Stream.runCollect);
        })
      );

      // Run both consumers concurrently
      const [events1, events2] = yield* Effect.all([
        consumer1,
        consumer2
      ], { concurrency: "unbounded" }).pipe(
        Effect.timeout("8 seconds")
      );

      const array1 = Array.from(events1);
      const array2 = Array.from(events2);

      console.log(`✅ Consumer 1 received ${array1.length} events`);
      console.log(`✅ Consumer 2 received ${array2.length} events`);

      expect(array1.length).toBe(3);
      expect(array2.length).toBe(2);

      // Collect all received IDs to verify pub/sub behavior
      const allIds = [...array1, ...array2].map(e => e.id);
      const uniqueIds = new Set(allIds);
      console.log(`📊 Total events: ${allIds.length}, Unique IDs: ${uniqueIds.size}`);

      // Pub/sub broadcasts to all consumers - events SHOULD be duplicated
      expect(uniqueIds.size).toBeLessThan(allIds.length);

      // Verify overlap between consumers (proving broadcast behavior)
      const consumer1Ids = new Set(array1.map(e => e.id));
      const consumer2Ids = new Set(array2.map(e => e.id));
      const overlap = [...consumer1Ids].filter(id => consumer2Ids.has(id));
      expect(overlap.length).toBeGreaterThan(0);
      console.log(`✅ Broadcast verified: ${overlap.length} events received by both consumers`);

      // Each event should have correct structure
      [...array1, ...array2].forEach(event => {
        expect(event.id).toMatch(/^bg-\d+$/);
        expect(event.index).toBeGreaterThan(0);
        expect(typeof event.timestamp).toBe("number");
        expect(event.timestamp).toBeLessThanOrEqual(Date.now());
      });

      // Verify each consumer individually has sequential events
      // (We don't check ordering across consumers since they connect at different times)
      const seqConsumer1Ids = array1.map(e => parseInt(e.id.replace('bg-', ''), 10));
      const seqConsumer2Ids = array2.map(e => parseInt(e.id.replace('bg-', ''), 10));

      for (let i = 0; i < seqConsumer1Ids.length - 1; i++) {
        const curr = seqConsumer1Ids[i];
        const next = seqConsumer1Ids[i + 1];
        if (curr !== undefined && next !== undefined) {
          expect(next).toBeGreaterThan(curr);
        }
      }
      for (let i = 0; i < seqConsumer2Ids.length - 1; i++) {
        const curr = seqConsumer2Ids[i];
        const next = seqConsumer2Ids[i + 1];
        if (curr !== undefined && next !== undefined) {
          expect(next).toBeGreaterThan(curr);
        }
      }

      console.log("🎉 Multiple consumers test completed!");
    }).pipe(Effect.timeout("15 seconds"))
    , { timeout: 20000 });
});
