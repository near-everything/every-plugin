import type { Context as HonoContext } from "hono";
import { auth } from "./auth";
import { ORPCRuntime } from "../runtime/rpc";

export type CreateContextOptions = {
	context: HonoContext;
};

export async function createContext({ context }: CreateContextOptions) {
	const session = await auth.api.getSession({
		headers: context.req.raw.headers,
	});

	if (!session) {
		return {
			user: null,
			session: null,
			runtime: ORPCRuntime
		}
	}

	return {
		session: session.session,
		user: session.user,
		runtime: ORPCRuntime
	}
}

export type Context = Awaited<ReturnType<typeof createContext>>;
