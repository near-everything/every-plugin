import type { RouterContext } from "@/types";
import { TanStackDevtools } from "@tanstack/react-devtools";
import {
  ClientOnly,
  createRootRouteWithContext,
  HeadContent,
  Outlet,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";

export const Route = createRootRouteWithContext<RouterContext>()({
  loader: ({ context }) => {
    return {
      assetsUrl: context.assetsUrl || "",
      siteUrl: context.runtimeConfig?.hostUrl || "",
    };
  },
  head: ({ loaderData }) => {
    const assetsUrl = loaderData?.assetsUrl || "";
    const siteUrl = loaderData?.siteUrl || "";
    const title = "demo.everything";
    const description =
      "Demo application showcasing Module Federation with SSR, TanStack Router, and oRPC";
    const siteName = "Every Demo";
    const ogImage = `${assetsUrl}/metadata.png`;

    return {
      meta: [
        { charSet: "utf-8" },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1.0, viewport-fit=cover",
        },
        { title },
        { name: "description", content: description },
        { name: "theme-color", content: "#171717" },
        { name: "color-scheme", content: "light dark" },
        { name: "application-name", content: siteName },
        { name: "mobile-web-app-capable", content: "yes" },
        {
          name: "apple-mobile-web-app-status-bar-style",
          content: "black-translucent",
        },
        { name: "format-detection", content: "telephone=no" },
        { name: "robots", content: "index, follow" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: siteUrl },
        { property: "og:image", content: ogImage },
        { property: "og:site_name", content: siteName },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: ogImage },
      ],
      links: [
        { rel: "canonical", href: siteUrl },
        { rel: "stylesheet", href: `${assetsUrl}/static/css/style.css` },
        { rel: "preconnect", href: "https://fonts.googleapis.com" },
        {
          rel: "preconnect",
          href: "https://fonts.gstatic.com",
          crossOrigin: "anonymous",
        },
        { rel: "icon", type: "image/x-icon", href: `${assetsUrl}/favicon.ico` },
        { rel: "icon", type: "image/svg+xml", href: `${assetsUrl}/icon.svg` },
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: `${assetsUrl}/apple-touch-icon.png`,
        },
        { rel: "manifest", href: `${assetsUrl}/manifest.json` },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: siteName,
            url: siteUrl,
            description,
          }),
        },
        {
          children: `(function(){var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}})();`,
        },
      ],
    };
  },
  component: RootComponent,
});

function RootComponent() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Outlet />
      <Toaster position="bottom-right" richColors closeButton />
      <ClientOnly>
        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
            TanStackQueryDevtools,
          ]}
        />
      </ClientOnly>
    </ThemeProvider>
  );
}
