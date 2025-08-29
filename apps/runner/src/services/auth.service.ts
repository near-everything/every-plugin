import { Context, Layer } from 'effect';
import { auth } from '../lib/auth';

export interface AuthServiceData {
  readonly auth: typeof auth;
}

export class AuthService extends Context.Tag("AuthService")<
  AuthService,
  AuthServiceData
>() {}

export const AuthServiceLive = Layer.succeed(AuthService, { auth });
