import { describe, expect, it } from "vitest";
import { getPluginClient, testNotionals, testRoutes } from "../setup";

describe("Rate Quotes", () => {
  it("returns quotes for all route/notional combinations", async () => {
    const client = await getPluginClient();
    const result = await client.getRates({
      routes: [testRoutes[0]!],
      notionals: testNotionals
    });

    console.log("\n💰 Rates:", JSON.stringify({
      count: result.rates.length,
      sample: result.rates.slice(0, 2).map(r => ({
        amountIn: r.amountIn,
        amountOut: r.amountOut,
        effectiveRate: r.effectiveRate,
        totalFeesUsd: r.totalFeesUsd
      }))
    }, null, 2));

    expect(result.rates.length).toBeGreaterThanOrEqual(1);
    result.rates.forEach(rate => {
      expect(rate.source).toEqual(testRoutes[0]!.source);
      expect(rate.destination).toEqual(testRoutes[0]!.destination);
      expect(rate.amountIn).toBeDefined();
      expect(rate.amountOut).toBeDefined();
      expect(rate.effectiveRate).toBeGreaterThan(0);
      if (rate.totalFeesUsd !== null) {
        expect(rate.totalFeesUsd).toBeGreaterThanOrEqual(0);
      }
      expect(rate.quotedAt).toBeDefined();
    });
  });
});
