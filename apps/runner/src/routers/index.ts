import type { RouterClient } from "@orpc/server";
import { publicProcedure } from "../lib/orpc";
import { itemRouter } from "./items";
import { queueRouter } from "./queues";
import { runRouter } from "./runs";
import { workflowRouter } from "./workflows";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => {
		return "OK";
	}),
	workflows: workflowRouter,
	queues: queueRouter,
	runs: runRouter,
	items: itemRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
