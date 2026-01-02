import { QueryClient } from "@tanstack/react-query";
import {
  createBrowserHistory,
  createRouter as createTanStackRouter,
} from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./styles.css";
import type { CreateRouterOptions } from "./types";

export type {
  ClientRuntimeConfig, CreateRouterOptions, RouterContext, RouterModule
} from "./types";

function NotFoundComponent() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground mb-4">404</h1>
        <p className="text-muted-foreground mb-8">Page not found</p>
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
        >
          Go Home
        </a>
      </div>
    </div>
  );
}

function ErrorComponent({ error }: { error: Error }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-foreground mb-4">Oops!</h1>
        <p className="text-muted-foreground mb-4">Something went wrong</p>
        <details className="text-sm text-muted-foreground bg-muted p-4 rounded mb-8">
          <summary className="cursor-pointer">Error Details</summary>
          <pre className="mt-2 whitespace-pre-wrap text-left">
            {error.message}
          </pre>
        </details>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}

function PendingComponent() {
  return <div className="min-h-screen w-full bg-background" />;
}

export function createRouter(opts: CreateRouterOptions = {}) {
  const queryClient =
    opts.context?.queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,
          gcTime: 30 * 60 * 1000,
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    });

  const history = opts.history ?? createBrowserHistory();

  const router = createTanStackRouter({
    routeTree,
    history,
    context: {
      queryClient,
      assetsUrl: opts.context?.assetsUrl ?? "",
      runtimeConfig: opts.context?.runtimeConfig,
    },
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultStructuralSharing: true,
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: NotFoundComponent,
    defaultErrorComponent: ErrorComponent,
    defaultPendingComponent: PendingComponent,
    defaultPendingMinMs: 100,
  });

  return { router, queryClient };
}

export { routeTree };

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createRouter>["router"];
  }
}
