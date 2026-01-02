import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { apiClient } from "../../../../utils/orpc";

export type KvValueResult = Awaited<ReturnType<typeof apiClient.getValue>>;

function generateOgImageSvg(keyId: string): string {
  const escapedKey =
    keyId.length > 40 ? `${keyId.slice(0, 37)}...` : keyId;
  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#171717"/>
    <text x="600" y="315" font-family="monospace" font-size="48" fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${escapedKey}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export const Route = createFileRoute("/_layout/_authenticated/keys/$key")({
  loader: async ({ params }) => {
    try {
      const data = await apiClient.getValue({ key: params.key });
      return { data };
    } catch (error) {
      return { error: error as Error, data: null };
    }
  },
  head: ({ params, loaderData }) => {
    const keyName = params.key;
    const hasData = loaderData?.data !== null;
    const title = `Key: ${keyName} | demo.everything`;
    const description = hasData
      ? `View the value for key "${keyName}" in the key-value store.`
      : `Key "${keyName}" not found in the store.`;
    const ogImage = generateOgImageSvg(keyName);

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:image", content: ogImage },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        { name: "twitter:image", content: ogImage },
      ],
    };
  },
  component: KeyValue,
});

function KeyValue() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { key } = Route.useParams();
  const { data, error } = Route.useLoaderData();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.deleteKey({ key }),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["listKeys"] });
      router.navigate({ to: "/keys" });
    },
  });

  const handleBack = () => {
    if (router.history.canGoBack()) {
      router.history.back();
    } else {
      router.navigate({ to: "/keys" });
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div>
          <button
            type="button"
            onClick={handleBack}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
          >
            ← back
          </button>
          <h1 className="text-lg font-mono mt-2">Key: {key}</h1>
        </div>
        {data && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="px-3 py-1.5 text-xs font-mono bg-destructive/10 text-destructive hover:bg-destructive/20 rounded border border-destructive/20 transition-colors disabled:opacity-50"
          >
            {deleteMutation.isPending ? "deleting..." : "delete"}
          </button>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/20">
          <p className="text-sm mb-3">
            Are you sure you want to delete key "{key}"?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="px-3 py-1.5 text-xs font-mono bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded transition-colors disabled:opacity-50"
            >
              {deleteMutation.isPending ? "deleting..." : "confirm delete"}
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleteMutation.isPending}
              className="px-3 py-1.5 text-xs font-mono bg-muted hover:bg-muted/80 rounded transition-colors disabled:opacity-50"
            >
              cancel
            </button>
          </div>
          {deleteMutation.isError && (
            <p className="text-xs text-destructive mt-2">
              Error: {deleteMutation.error?.message || "Failed to delete"}
            </p>
          )}
        </div>
      )}

      <div className="space-y-4">
        {error ? (
          <div className="p-6 bg-destructive/10 rounded-lg border border-destructive/20">
            <p className="text-sm text-destructive">
              Error: {error.message || "Failed to load key"}
            </p>
          </div>
        ) : data ? (
          <div className="p-6 bg-muted/20 rounded-lg border border-border/50">
            <h3 className="text-sm font-mono mb-2">Value</h3>
            <pre className="text-xs font-mono text-muted-foreground overflow-auto bg-background p-3 rounded border">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="p-6 bg-muted/20 rounded-lg border border-border/50">
            <p className="text-sm text-muted-foreground">
              No value found for key "{key}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
