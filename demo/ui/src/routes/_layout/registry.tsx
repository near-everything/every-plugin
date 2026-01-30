import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { BosConfig } from "everything-dev/types";
import { Graph } from "near-social-js";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export interface GatewayEntry {
  account: string;
  domain: string;
  config: BosConfig;
}

export function parseGatewayData(data: Record<string, unknown>): GatewayEntry[] {
  const entries: GatewayEntry[] = [];

  for (const [account, accountData] of Object.entries(data)) {
    if (!accountData || typeof accountData !== "object") continue;

    const bos = (accountData as Record<string, unknown>).bos;
    if (!bos || typeof bos !== "object") continue;

    const gateways = (bos as Record<string, unknown>).gateways;
    if (!gateways || typeof gateways !== "object") continue;

    for (const [domain, domainData] of Object.entries(
      gateways as Record<string, unknown>,
    )) {
      if (!domainData || typeof domainData !== "object") continue;

      const configJson = (domainData as Record<string, unknown>)[
        "bos.config.json"
      ];
      if (typeof configJson !== "string") continue;

      try {
        const config = JSON.parse(configJson) as BosConfig;
        entries.push({ account, domain, config });
      } catch {
        continue;
      }
    }
  }

  return entries;
}

export function getAccountSlug(account: string): string {
  return account.replace(/\.near$/, "").replace(/\./g, "-");
}

export async function fetchGateways(): Promise<GatewayEntry[]> {
  const graph = new Graph();
  const data = await graph.get({
    keys: ["*/bos/gateways/*/bos.config.json"],
  });

  if (!data) return [];
  return parseGatewayData(data);
}

export const Route = createFileRoute("/_layout/registry")({
  loader: async () => {
    const data = await fetchGateways();
    return { data };
  },
  head: () => ({
    meta: [
      { title: "Registry | everything.dev" },
      {
        name: "description",
        content: "Browse and explore published BOS applications on NEAR",
      },
    ],
  }),
  component: RegistryPage,
});

function RegistryPage() {
  const router = useRouter();
  const { data: initialData } = Route.useLoaderData();
  const [search, setSearch] = useState("");

  const handleBack = () => {
    if (router.history.canGoBack()) {
      router.history.back();
    } else {
      router.navigate({ to: "/" });
    }
  };

  const gatewaysQuery = useSuspenseQuery({
    queryKey: ["registry", "gateways"],
    queryFn: fetchGateways,
    initialData,
    staleTime: 1000 * 60 * 5,
  });

  const filteredGateways = useMemo(() => {
    if (!gatewaysQuery.data) return [];
    if (!search.trim()) return gatewaysQuery.data;

    const query = search.toLowerCase();
    return gatewaysQuery.data.filter((entry: GatewayEntry) => {
      const title = entry.config.app?.host?.title?.toLowerCase() || "";
      const description =
        entry.config.app?.host?.description?.toLowerCase() || "";
      const account = entry.account.toLowerCase();
      const domain = entry.domain.toLowerCase();

      return (
        title.includes(query) ||
        description.includes(query) ||
        account.includes(query) ||
        domain.includes(query)
      );
    });
  }, [gatewaysQuery.data, search]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div>
          <button
            type="button"
            onClick={handleBack}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
          >
            ← back
          </button>
          <h1 className="text-lg font-mono mt-2">Registry</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Browse published BOS applications
          </p>
        </div>
      </div>

      <Input
        type="text"
        placeholder="Search gateways..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="font-mono"
      />

      {gatewaysQuery.isLoading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {gatewaysQuery.isError && (
        <div className="p-8 text-center text-destructive">
          <p className="text-sm font-mono">Failed to load registry</p>
          <p className="text-xs mt-1">
            {gatewaysQuery.error instanceof Error
              ? gatewaysQuery.error.message
              : "Unknown error"}
          </p>
        </div>
      )}

      {gatewaysQuery.isSuccess && filteredGateways.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">
          <p className="text-sm font-mono">
            {search
              ? "No matching gateways found"
              : "No gateways published yet"}
          </p>
        </div>
      )}

      {gatewaysQuery.isSuccess && filteredGateways.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredGateways.map((entry) => {
            const title = entry.config.app?.host?.title || entry.account;
            const description =
              entry.config.app?.host?.description || "No description";
            const slug = getAccountSlug(entry.account);
            const previewUrl = `https://${slug}.${entry.domain}`;

            return (
              <Link
                key={`${entry.account}-${entry.domain}`}
                to="/registry/$account/$domain"
                params={{ account: entry.account, domain: entry.domain }}
              >
                <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
                  <CardHeader>
                    <CardTitle className="text-base font-mono">
                      {title}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary" className="font-mono text-xs">
                        {entry.account}
                      </Badge>
                      <Badge variant="outline" className="font-mono text-xs">
                        {entry.domain}
                      </Badge>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {previewUrl}
                    </p>
                  </CardFooter>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {gatewaysQuery.isSuccess && (
        <p className="text-xs text-muted-foreground text-center font-mono">
          {filteredGateways.length} gateway
          {filteredGateways.length !== 1 ? "s" : ""} found
        </p>
      )}
    </div>
  );
}
