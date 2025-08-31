import { Context, Layer } from "effect";
import { auth } from "./lib/auth";

interface IAuthService {
	readonly auth: typeof auth;
}

export class AuthService extends Context.Tag("AuthService")<
	AuthService,
	IAuthService
>() {}

export const AuthServiceLive = Layer.succeed(AuthService, { auth });
