import { describe, expect, it } from "vitest";
import { getPluginClient } from "../setup";

describe("Asset Listings", () => {
  it("returns assets in NEAR Intents format", async () => {
    const client = await getPluginClient();
    const result = await client.getListedAssets();

    console.log("\n📦 Assets:", JSON.stringify({
      count: result.assets.length,
      sample: result.assets.slice(0, 3).map(a => ({
        symbol: a.symbol,
        assetId: a.assetId,
        blockchain: a.blockchain
      }))
    }, null, 2));

    expect(result.assets.length).toBeGreaterThan(0);
    result.assets.forEach(asset => {
      expect(asset).toHaveProperty("blockchain");
      expect(asset).toHaveProperty("assetId");
      expect(asset).toHaveProperty("symbol");
      expect(asset).toHaveProperty("decimals");
    });
  });

  it("removes duplicates across chains", async () => {
    const client = await getPluginClient();
    const result = await client.getListedAssets();

    const assetKeys = new Set<string>();
    result.assets.forEach(asset => {
      const key = `${asset.blockchain}:${asset.assetId}`;
      expect(assetKeys.has(key), `Duplicate asset found: ${key}`).toBe(false);
      assetKeys.add(key);
    });
  });
});
