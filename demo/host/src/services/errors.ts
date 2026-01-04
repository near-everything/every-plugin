import { Data } from "effect";

export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly path?: string;
  readonly cause?: unknown;
}> {}

export class DatabaseError extends Data.TaggedError("DatabaseError")<{
  readonly cause?: unknown;
}> {}

export class FederationError extends Data.TaggedError("FederationError")<{
  readonly remoteName: string;
  readonly remoteUrl?: string;
  readonly cause?: unknown;
}> {}

export class PluginError extends Data.TaggedError("PluginError")<{
  readonly pluginName?: string;
  readonly pluginUrl?: string;
  readonly cause?: unknown;
}> {}

export class ServerError extends Data.TaggedError("ServerError")<{
  readonly cause?: unknown;
}> {}
