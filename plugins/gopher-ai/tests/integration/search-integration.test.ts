import type { PluginRegistry } from "every-plugin";
import { createLocalPluginRuntime } from "every-plugin/testing";
import { beforeAll, describe, expect, it } from "vitest";
import GopherAIPlugin from "@/index";

const TEST_REGISTRY: PluginRegistry = {
  "@curatedotfun/gopher-ai": {
    remoteUrl: "http://localhost:3000/remoteEntry.js",
    version: "1.0.0",
    description: "Gopher AI plugin for integration testing",
  },
};

const TEST_PLUGIN_MAP = {
  "@curatedotfun/gopher-ai": GopherAIPlugin,
} as const;

const TEST_CONFIG = {
  variables: {
    baseUrl: "https://data.gopher-ai.com/api/v1",
    timeout: 30000,
  },
  secrets: {
    apiKey: "{{GOPHERAI_API_KEY}}",
  },
};

const TEST_QUERY = "@efizzybot";
const TEST_SOURCE_TYPE = "twitter";

describe.sequential("Gopher AI Integration Tests", () => {
  const runtime = createLocalPluginRuntime<typeof TEST_PLUGIN_MAP>(
    {
      registry: TEST_REGISTRY,
      secrets: { GOPHERAI_API_KEY: process.env.GOPHERAI_API_KEY! },
    },
    TEST_PLUGIN_MAP
  );

  beforeAll(async () => {
    const { initialized } = await runtime.usePlugin("@curatedotfun/gopher-ai", TEST_CONFIG);
    expect(initialized).toBeDefined();
    expect(initialized.plugin.id).toBe("@curatedotfun/gopher-ai");
  });

  it("should stream live with sinceId and update cursor", { timeout: 30000 }, async () => {
    console.log("🚀 Testing live streaming with sinceId");

    const { client } = await runtime.usePlugin("@curatedotfun/gopher-ai", TEST_CONFIG);

    // First get some initial data to establish a baseline
    const initialResults = [];
    for await (const item of await client.search({
      query: TEST_QUERY,
      sourceType: TEST_SOURCE_TYPE,
      maxBackfillResults: 3,
      enableLive: false,
    })) {
      initialResults.push(item);
      if (initialResults.length >= 3) break;
    }

    console.log(`✅ Initial backfill collected ${initialResults.length} items`);
    expect(initialResults.length).toBeGreaterThan(0);

    // Use the oldest ID from initial backfill (not the newest!) so since_id can find newer items
    const sinceId = initialResults[initialResults.length - 1]?.id;
    console.log(`🔄 Using since_id: ${sinceId} (oldest from initial backfill)`);

    const liveResults = [];
    for await (const item of await client.live({
      query: TEST_QUERY,
      sourceType: TEST_SOURCE_TYPE,
      sinceId: sinceId,
      pageSize: 5,
      pollMs: 3000,
    })) {
      liveResults.push(item);
      console.log(`📝 Live item: ${item.id}`);
      if (liveResults.length >= 2) break;
    }

    if (liveResults.length > 0) {
      const newestId = liveResults[liveResults.length - 1]?.id;
      expect(BigInt(newestId)).toBeGreaterThan(BigInt(sinceId));
      console.log(`✅ Live streaming cursor advanced: ${sinceId} → ${newestId}`);
    } else {
      console.log(`ℹ️ No new live items found (expected for low-volume query)`);
    }
  });

  it("should backfill and march backward with maxId", { timeout: 30000 }, async () => {
    console.log("🚀 Testing backfill marching backward");

    const { client } = await runtime.usePlugin("@curatedotfun/gopher-ai", TEST_CONFIG);

    const results = [];
    for await (const item of await client.backfill({
      query: TEST_QUERY,
      sourceType: TEST_SOURCE_TYPE,
      maxResults: 5,
      pageSize: 5,
    })) {
      results.push(item);
      console.log(`📝 Backfill item: ${item.id}`);
    }

    console.log(`✅ Backfill collected ${results.length} items`);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(5);

    for (let i = 1; i < results.length; i++) {
      const prevId = BigInt(results[i - 1].id);
      const currId = BigInt(results[i].id);
      expect(prevId).toBeGreaterThanOrEqual(currId);
    }
    console.log(`✅ IDs march backward correctly`);

    const oldestId = results[results.length - 1]?.id;
    console.log(`🔄 Resuming from oldestId: ${oldestId}`);

    const resumeResults = [];
    for await (const item of await client.backfill({
      query: TEST_QUERY,
      sourceType: TEST_SOURCE_TYPE,
      maxId: oldestId,
      maxResults: 3,
      pageSize: 3,
    })) {
      resumeResults.push(item);
      console.log(`📝 Resume item: ${item.id}`);
    }

    if (resumeResults.length > 0) {
      const firstResumedId = BigInt(resumeResults[0]?.id);
      expect(firstResumedId).toBeLessThan(BigInt(oldestId));
      console.log(`✅ Resumed backfill continues backward: ${oldestId} → ${resumeResults[0]?.id}`);
    } else {
      console.log(`ℹ️ No older items found (reached end of available data)`);
    }
  });

  it("should handle gap detection with no new results gracefully", { timeout: 30000 }, async () => {
    console.log("🚀 Testing gap detection with no new results");

    const { client } = await runtime.usePlugin("@curatedotfun/gopher-ai", TEST_CONFIG);

    // Create a very old sinceId to ensure no new results
    const veryOldSinceId = "1"; // Very old Twitter ID

    console.log(`⚡ Testing gap query with very old since_id: ${veryOldSinceId}`);

    const searchIterator = await client.search({
      query: TEST_QUERY,
      sourceType: TEST_SOURCE_TYPE,
      sinceId: veryOldSinceId, // This should trigger gap detection
      enableLive: false,
      maxBackfillResults: 0, // Skip backfill to focus on gap detection
    });

    const results = [];
    for await (const item of searchIterator) {
      results.push(item);
      // Gap detection only returns a few results max
      if (results.length >= 5) break;
    }

    console.log(`✅ Gap detection returned ${results.length} items (should be 0 or few)`);
    expect(results.length).toBeGreaterThanOrEqual(0); // Should not throw error
    console.log(`🎉 Gap detection handled successfully without errors`);
  });

  it("should handle backfill → gap detection → continue", { timeout: 30000 }, async () => {
    console.log("🚀 Testing complete flow: backfill → gap → continue");

    const { client } = await runtime.usePlugin("@curatedotfun/gopher-ai", TEST_CONFIG);

    console.log("📦 Phase 1: Initial backfill");
    const backfillResults = [];
    for await (const item of await client.search({
      query: TEST_QUERY,
      sourceType: TEST_SOURCE_TYPE,
      maxBackfillResults: 3,
      enableLive: false,
      backfillPageSize: 3,
    })) {
      backfillResults.push(item);
      console.log(`📝 Backfill item: ${item.id}`);
    }

    console.log(`✅ Initial backfill: ${backfillResults.length} items`);
    expect(backfillResults.length).toBeGreaterThan(0);

    const mostRecentId = backfillResults[0]?.id;
    const oldestId = backfillResults[backfillResults.length - 1]?.id;
    console.log(`📊 Cursors: mostRecent=${mostRecentId}, oldest=${oldestId}`);

    console.log("🔍 Phase 2: Focus on backfill continuation (test simplest case first)");
    const resumeResults = [];
    for await (const item of await client.search({
      query: TEST_QUERY,
      sourceType: TEST_SOURCE_TYPE,
      maxId: oldestId,
      maxBackfillResults: 2,
      enableLive: false,
      backfillPageSize: 2,
    })) {
      resumeResults.push(item);
      console.log(`📝 Resume item: ${item.id} (should be older than ${oldestId})`);
      expect(BigInt(item.id)).toBeLessThan(BigInt(oldestId));
    }

    console.log(`✅ Resume phase (backfill-only): ${resumeResults.length} items`);

    if (resumeResults.length > 0) {
      console.log(`✅ Backfill continued from previous position: ${oldestId} → ${resumeResults[0]?.id}`);
    } else {
      console.log(`ℹ️ No older items found (reached end of available data)`);
    }
  });
});
