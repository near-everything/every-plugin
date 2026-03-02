declare module "host/program" {
	import type { ServerHandle, ServerInput } from "./program";

	export const runServer: (input: ServerInput) => ServerHandle;
	export type { ServerHandle, ServerInput };
}
