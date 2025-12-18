import type { RouterClient } from 'every-plugin/orpc';
import { os } from 'every-plugin/orpc';
import type { Plugins } from '../runtime';

export function createRouter(plugins: Plugins) {
  const baseRouter = {
    health: os.route({ method: 'GET', path: '/health' }).handler(() => 'OK'),
  } as const;

  if (!plugins.status.available || !plugins.api?.router) {
    console.warn(
      '[Router] Plugin router not available, using base router only'
    );
    return baseRouter;
  }

  return {
    ...baseRouter,
    ...plugins.api.router,
  } as const;
}

export type AppRouter = ReturnType<typeof createRouter>;
export type AppRouterClient = RouterClient<AppRouter>;
