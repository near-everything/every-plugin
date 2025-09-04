/// <reference types="vite/client" />
import appCss from "@/styles/app.css?url";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { TanstackProvider } from "fumadocs-core/framework/tanstack";
import { RootProvider } from "fumadocs-ui/provider/base";
import { ThemeProvider } from "next-themes";
import * as React from "react";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "every plugin | composable remote plugin runtime",
      },
      {
        name: "title",
        content: "every plugin | composable remote plugin runtime",
      },
      {
        name: "description",
        content: "An open source, modular plugin runtime & system built with Effect.TS for loading, initializing, and executing remote plugins via Module Federation. Create and connect remote plugins together to build powerful workflows.",
      },
      // Open Graph / Facebook
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:url",
        content: "https://plugin.everything.dev/",
      },
      {
        property: "og:title",
        content: "every plugin | composable remote plugin runtime",
      },
      {
        property: "og:description",
        content: "An open source, modular plugin runtime & system built with Effect.TS for loading, initializing, and executing remote plugins via Module Federation. Create and connect remote plugins together to build powerful workflows.",
      },
      {
        property: "og:image",
        content: "/metadata.png",
      },
      // X (Twitter)
      {
        property: "twitter:card",
        content: "summary_large_image",
      },
      {
        property: "twitter:url",
        content: "https://plugin.everything.dev/",
      },
      {
        property: "twitter:title",
        content: "every plugin | composable remote plugin runtime",
      },
      {
        property: "twitter:description",
        content: "An open source, modular plugin runtime & system built with Effect.TS for loading, initializing, and executing remote plugins via Module Federation. Create and connect remote plugins together to build powerful workflows.",
      },
      {
        property: "twitter:image",
        content: "/metadata.png",
      },
      // Additional SEO
      {
        name: "robots",
        content: "index, follow",
      },
      {
        name: "author",
        content: "every plugin",
      },
      {
        name: "keywords",
        content: "plugin runtime, module federation, effect.ts, remote plugins, composable plugins, typescript, orpc",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "canonical", href: "https://plugin.everything.dev/" },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning lang={"en"}>
      <head>
        <HeadContent />
      </head>
      <body className="flex flex-col min-h-screen">
        <TanstackProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <RootProvider>{children}</RootProvider>
          </ThemeProvider>
        </TanstackProvider>
        <Scripts />
      </body>
    </html>
  );
}
