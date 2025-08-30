import { Config, Context, Layer, type Redacted } from "effect";

export interface AppConfigData {
	readonly redisUrl: Redacted.Redacted<string>;
	readonly databaseUrl: Redacted.Redacted<string>;
	readonly port: number;
	readonly betterAuthUrl: string;
	readonly betterAuthSecret: Redacted.Redacted<string>;
	readonly adminUserIds: string[];
}

export class AppConfig extends Context.Tag("AppConfig")<
	AppConfig,
	AppConfigData
>() {}

const appConfigSchema = Config.all({
	redisUrl: Config.redacted("REDIS_URL"),
	databaseUrl: Config.redacted("DATABASE_URL"),
	port: Config.integer("PORT").pipe(Config.withDefault(3000)),
	betterAuthUrl: Config.string("BETTER_AUTH_URL").pipe(
		Config.withDefault("http://localhost:3000"),
	),
	betterAuthSecret: Config.redacted("BETTER_AUTH_SECRET"),
	adminUserIds: Config.string("ADMIN_USER_IDS").pipe(
		Config.withDefault(""),
		Config.map((ids) => ids.split(",").filter(Boolean)),
	),
});

export const AppConfigLive = Layer.effect(AppConfig, appConfigSchema);
