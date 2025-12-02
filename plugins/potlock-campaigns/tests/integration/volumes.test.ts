import { describe, expect, it } from "vitest";
import { getPluginClient } from "../setup";

describe("Volume Data", () => {
  it("returns requested time windows", async () => {
    const client = await getPluginClient();
    const result = await client.getVolumes({ includeWindows: ["24h", "7d", "30d"] });

    console.log("\n📊 Volumes:", JSON.stringify(
      result.volumes.map(v => ({ window: v.window, volumeUsd: v.volumeUsd })),
      null, 2
    ));

    expect(result.volumes).toHaveLength(3);
    expect(result.volumes.map(v => v.window)).toEqual(["24h", "7d", "30d"]);
  });

  it("volumes increase over larger windows", async () => {
    const client = await getPluginClient();
    const result = await client.getVolumes({ includeWindows: ["24h", "7d", "30d"] });

    const vol24h = result.volumes.find(v => v.window === "24h")!;
    const vol7d = result.volumes.find(v => v.window === "7d")!;
    const vol30d = result.volumes.find(v => v.window === "30d")!;

    expect(vol7d.volumeUsd).toBeGreaterThanOrEqual(vol24h.volumeUsd);
    expect(vol30d.volumeUsd).toBeGreaterThanOrEqual(vol7d.volumeUsd);
  });
});
