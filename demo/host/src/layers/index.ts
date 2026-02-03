import { Layer } from "every-plugin/effect";
import { AuthService } from "../services/auth";
import { DatabaseService } from "../services/database";
import { PluginsService } from "../services/plugins";

export const DatabaseLive = DatabaseService.Default;

export const AuthLive = AuthService.Default.pipe(
  Layer.provide(DatabaseLive)
);

export const PluginsLive = PluginsService.Live;

export const BaseLive = Layer.mergeAll(DatabaseLive, AuthLive);
