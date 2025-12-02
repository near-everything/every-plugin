import { describe, expect, it } from "vitest";
import { getPluginClient } from "../setup";

describe("Plugin Sanity Check", () => {
  it("ping returns healthy status", async () => {
    const client = await getPluginClient();
    const result = await client.ping();

    expect(result.status).toBe("ok");
  });
});
