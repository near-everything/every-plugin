import { describe, expect, it } from "vitest";
import { getPluginClient, testRoutes, testNotionals } from "../setup";

describe("Full Snapshot", () => {
  it("coordinates all data sources", async () => {
    const client = await getPluginClient();
    const result = await client.getSnapshot({
      routes: [testRoutes[0]!],
      notionals: [testNotionals[0]!],
      includeWindows: ["24h"]
    });

    console.log("\n📊 Snapshot:", JSON.stringify({
      volumes: result.volumes.length,
      assets: result.listedAssets.assets.length,
      rates: result.rates?.length || 0,
      liquidity: result.liquidity?.length || 0
    }, null, 2));

    expect(result).toHaveProperty("volumes");
    expect(result).toHaveProperty("listedAssets");
    expect(Array.isArray(result.volumes)).toBe(true);
    expect(Array.isArray(result.listedAssets.assets)).toBe(true);

    if (result.rates) {
      expect(Array.isArray(result.rates)).toBe(true);
    }
    if (result.liquidity) {
      expect(Array.isArray(result.liquidity)).toBe(true);
    }
  });

  it("includes all requested volume windows", async () => {
    const client = await getPluginClient();
    const result = await client.getSnapshot({
      routes: [testRoutes[0]!],
      includeWindows: ["24h", "7d", "30d"]
    });

    expect(result.volumes.length).toBe(3);
    expect(result.volumes.map(v => v.window)).toEqual(["24h", "7d", "30d"]);
  });
});
