import { describe, expect, it } from "vitest";
import { getPluginClient, testNotionals, testRoutes } from "../setup";

describe("Router Transformations", () => {
  it("transforms routes correctly in middleware", async () => {
    const client = await getPluginClient();
    const result = await client.getRates({
      routes: [testRoutes[0]!],
      notionals: [testNotionals[0]!]
    });

    console.log("\n🔄 Route Transform:", JSON.stringify({
      input: {
        source: testRoutes[0]!.source.blockchain,
        destination: testRoutes[0]!.destination.blockchain
      },
      output: {
        source: result.rates[0]?.source.blockchain,
        destination: result.rates[0]?.destination.blockchain
      }
    }, null, 2));

    // Verify middleware transformed the route correctly
    result.rates.forEach(rate => {
      expect(rate.source).toEqual(testRoutes[0]!.source);
      expect(rate.destination).toEqual(testRoutes[0]!.destination);
    });
  });

  it("transforms assets from provider to NEAR Intents format", async () => {
    const client = await getPluginClient();
    const result = await client.getListedAssets();

    console.log("\n🔄 Asset Transform:", JSON.stringify({
      count: result.assets.length,
      format: result.assets[0] ? {
        hasBlockchain: !!result.assets[0].blockchain,
        assetIdFormat: result.assets[0].assetId.startsWith('nep141:') ? 'nep141' : 'other'
      } : null
    }, null, 2));

    // Verify router transformed provider assets to NEAR Intents format
    result.assets.forEach(asset => {
      expect(asset).toHaveProperty("blockchain");
    });
  });
});
