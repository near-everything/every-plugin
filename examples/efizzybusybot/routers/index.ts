import { publicProcedure } from "../lib/orpc";
import { plugins } from "../runtime";


// Compose app router with plugin routers
export const router = publicProcedure.router({
  healthCheck: publicProcedure.handler(() => ({
    status: "ok",
    service: "efizzybusybot",
    timestamp: new Date().toISOString(),
    mode: "polling" // TODO: detect webhook vs polling
  })),

  // Custom endpoints
  stats: publicProcedure.handler(async () => {
    // TODO: Return some stats about the bot
    return {
      uptime: new Date().toISOString(),
      messagesProcessed: 0 // TODO: get from database
    };
  }),

  // Mount telegram plugin router
  telegram: plugins.telegram.router
});

// Export types
export type AppRouter = typeof router;
