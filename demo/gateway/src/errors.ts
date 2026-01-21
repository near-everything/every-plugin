import { Data } from "effect";

export class ConfigNotFoundError extends Data.TaggedError("ConfigNotFoundError")<{
  account: string;
  path: string;
}> {}

export class ConfigParseError extends Data.TaggedError("ConfigParseError")<{
  account: string;
  cause: unknown;
}> {}

export class NovaError extends Data.TaggedError("NovaError")<{
  message: string;
  status?: number;
}> {}

export class ContainerStartError extends Data.TaggedError("ContainerStartError")<{
  account: string;
  cause: unknown;
}> {}

export class ContainerFetchError extends Data.TaggedError("ContainerFetchError")<{
  account: string;
  cause: unknown;
}> {}

export class TenantNotFoundError extends Data.TaggedError("TenantNotFoundError")<{
  hostname: string;
  message: string;
}> {}
