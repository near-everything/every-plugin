import { describe, expect, it } from "vitest";
import { getPluginClient, testRoutes } from "../setup";

describe("Liquidity Depth", () => {
  it("provides 50bps and 100bps thresholds", async () => {
    const client = await getPluginClient();
    const result = await client.getLiquidity({
      routes: [testRoutes[0]!]
    });

    console.log("\n💧 Liquidity:", JSON.stringify({
      routes: result.liquidity.length,
      thresholds: result.liquidity[0]?.thresholds.map(t => ({
        slippageBps: t.slippageBps,
        maxAmountIn: t.maxAmountIn
      }))
    }, null, 2));

    expect(result.liquidity.length).toBe(1);
    expect(result.liquidity[0]!.route).toEqual(testRoutes[0]);

    const thresholds = result.liquidity[0]!.thresholds;
    expect(thresholds.length).toBeGreaterThanOrEqual(2);

    const threshold50 = thresholds.find(t => t.slippageBps === 50);
    const threshold100 = thresholds.find(t => t.slippageBps === 100);

    expect(threshold50).toBeDefined();
    expect(threshold100).toBeDefined();

    expect(parseFloat(threshold50!.maxAmountIn)).toBeGreaterThan(0);
    expect(parseFloat(threshold100!.maxAmountIn)).toBeGreaterThan(0);
  });
});
