import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import {
  ClientOnly,
  createRootRouteWithContext,
  HeadContent,
  Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";

interface MyRouterContext {
  queryClient: QueryClient;
}

function getAssetBase(): string {
  if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__?.ui?.url) {
    return window.__RUNTIME_CONFIG__.ui.url;
  }
  return '';
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => {
    const assetBase = getAssetBase();
    return {
      meta: [
        { title: "demo.everything" },
        { name: "description", content: "Demo application showcasing Module Federation with SSR, TanStack Router, and oRPC" },
        { name: "theme-color", content: "#171717" },
        { name: "application-name", content: "Every Plugin Demo" },
        { name: "mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      ],
      links: [
        { rel: "icon", type: "image/x-icon", href: `${assetBase}/favicon.ico` },
        { rel: "icon", type: "image/svg+xml", href: `${assetBase}/icon.svg` },
        { rel: "apple-touch-icon", sizes: "180x180", href: `${assetBase}/apple-touch-icon.png` },
        { rel: "manifest", href: `${assetBase}/manifest.json` },
      ],
    };
  },
  component: RootComponent,
});

function RootComponent() {
  return (
    <>
      <HeadContent />
      <Outlet />
      <ClientOnly>
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
      </ClientOnly>
    </>
  );
}
