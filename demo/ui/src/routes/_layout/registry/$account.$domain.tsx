import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import type { BosConfig } from "everything-dev/types";
import { Graph } from "near-social-js";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { GatewayEntry } from "./registry";

function getAccountSlug(account: string): string {
  return account.replace(/\.near$/, "").replace(/\./g, "-");
}

async function fetchGateway(
  account: string,
  domain: string
): Promise<GatewayEntry | null> {
  const graph = new Graph();
  const configPath = `${account}/bos/gateways/${domain}/bos.config.json`;

  const data = await graph.get({
    keys: [configPath],
  });

  if (!data) return null;

  const parts = configPath.split("/");
  let current: unknown = data;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }

  if (typeof current !== "string") return null;

  try {
    const config = JSON.parse(current) as BosConfig;
    return { account, domain, config };
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/_layout/registry/$account/$domain")({
  loader: async ({ params }) => {
    const data = await fetchGateway(params.account, params.domain);
    return { data };
  },
  head: ({ params }) => ({
    meta: [
      { title: `${params.account} | Registry` },
      {
        name: "description",
        content: `View details for ${params.account} on ${params.domain}`,
      },
    ],
  }),
  component: GatewayDetailPage,
});

function GatewayDetailPage() {
  const router = useRouter();
  const params = Route.useParams();
  const { data: initialData } = Route.useLoaderData();
  const [iframeLoading, setIframeLoading] = useState(true);

  const handleBack = () => {
    if (router.history.canGoBack()) {
      router.history.back();
    } else {
      router.navigate({ to: "/registry" });
    }
  };

  const gatewayQuery = useSuspenseQuery({
    queryKey: ["registry", "gateway", params.account, params.domain],
    queryFn: () => fetchGateway(params.account, params.domain),
    initialData,
    staleTime: 1000 * 60 * 5,
  });

  const gateway = gatewayQuery.data;

  if (!gateway) {
    return (
      <div className="space-y-6">
        <div className="pb-4 border-b border-border/50">
          <button
            type="button"
            onClick={handleBack}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
          >
            ← back to registry
          </button>
        </div>
        <div className="p-8 text-center text-muted-foreground">
          <p className="text-sm font-mono">Gateway not found</p>
          <p className="text-xs mt-1">
            No configuration found for {params.account} on {params.domain}
          </p>
        </div>
      </div>
    );
  }

  const title = gateway.config.app?.host?.title || gateway.account;
  const description =
    gateway.config.app?.host?.description || "No description available";
  const slug = getAccountSlug(gateway.account);
  const previewUrl = `https://${slug}.${gateway.domain}`;

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-border/50">
        <button
          type="button"
          onClick={handleBack}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
        >
          ← back to registry
        </button>
        <h1 className="text-lg font-mono mt-2">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
        <div className="flex flex-wrap gap-2 mt-3">
          <Badge variant="secondary" className="font-mono text-xs">
            {gateway.account}
          </Badge>
          <Badge variant="outline" className="font-mono text-xs">
            {gateway.domain}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="preview" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="preview" className="flex-1 font-mono text-xs">
            Preview
          </TabsTrigger>
          <TabsTrigger value="config" className="flex-1 font-mono text-xs">
            Config
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground font-mono truncate flex-1">
              {previewUrl}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="font-mono text-xs"
                onClick={() => window.open(previewUrl, "_blank")}
              >
                Open in new tab
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="font-mono text-xs"
                disabled
                title="Coming soon"
              >
                Fork
              </Button>
            </div>
          </div>

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              {iframeLoading && (
                <div className="h-[600px] flex items-center justify-center bg-muted/20">
                  <div className="text-center space-y-2">
                    <Skeleton className="h-8 w-8 mx-auto rounded-full" />
                    <p className="text-xs text-muted-foreground font-mono">
                      Loading preview...
                    </p>
                  </div>
                </div>
              )}
              <iframe
                src={previewUrl}
                className={`w-full h-[600px] border-0 ${iframeLoading ? "hidden" : ""}`}
                onLoad={() => setIframeLoading(false)}
                title={`Preview of ${title}`}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-mono">bos.config.json</CardTitle>
              <CardDescription>
                Full configuration for this gateway
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-xs font-mono bg-muted/30 p-4 rounded-lg overflow-auto max-h-[500px]">
                {JSON.stringify(gateway.config, null, 2)}
              </pre>
            </CardContent>
          </Card>

          <Separator className="my-6" />

          <div className="space-y-4">
            <h3 className="text-sm font-mono font-semibold">App Modules</h3>

            {gateway.config.app?.host && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono">Host</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {gateway.config.app.host.production && (
                    <p className="text-xs font-mono text-muted-foreground">
                      Production: {gateway.config.app.host.production}
                    </p>
                  )}
                  {gateway.config.app.host.development && (
                    <p className="text-xs font-mono text-muted-foreground">
                      Development: {gateway.config.app.host.development}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {gateway.config.app?.ui && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono">UI</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs font-mono text-muted-foreground overflow-auto">
                    {JSON.stringify(gateway.config.app.ui, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}

            {gateway.config.app?.api && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-mono">API</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs font-mono text-muted-foreground overflow-auto">
                    {JSON.stringify(gateway.config.app.api, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
