import { Layer } from "every-plugin/effect";
import { AuthService } from "../services/auth";
import { ConfigService } from "../services/config";
import { DatabaseService } from "../services/database";
import { FederationServerService } from "../services/federation.server";
import { PluginsService } from "../services/plugins";

export const ConfigLive = ConfigService.Default;

export const DatabaseLive = DatabaseService.Default;

export const AuthLive = AuthService.Default;

export const PluginsLive = PluginsService.Live;

export const FederationServerLive = FederationServerService.Live;

export const CoreLive = Layer.mergeAll(ConfigLive, DatabaseLive, AuthLive);

export const FullServerLive = Layer.mergeAll(CoreLive, PluginsLive);
