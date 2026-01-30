import { Effect, Layer } from "effect";
import { PlatformService } from "../types";
import { DarwinLayer } from "./darwin";
import { LinuxLayer } from "./linux";
import { WindowsLayer } from "./windows";

export const makePlatformLayer = (): Layer.Layer<PlatformService> => {
  const platform = process.platform;

  switch (platform) {
    case "darwin":
      return DarwinLayer;
    case "linux":
      return LinuxLayer;
    case "win32":
      return WindowsLayer;
    default:
      console.warn(`Unsupported platform: ${platform}, falling back to linux`);
      return LinuxLayer;
  }
};

export const PlatformLive = makePlatformLayer();

export const withPlatform = <A, E, R>(
  effect: Effect.Effect<A, E, R | PlatformService>
): Effect.Effect<A, E, Exclude<R, PlatformService>> =>
  effect.pipe(Effect.provide(PlatformLive)) as Effect.Effect<
    A,
    E,
    Exclude<R, PlatformService>
  >;

export { DarwinLayer, LinuxLayer, WindowsLayer };
export { PlatformService };
