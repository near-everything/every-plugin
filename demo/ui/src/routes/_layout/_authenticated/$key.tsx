import { createFileRoute, Link } from "@tanstack/react-router";
import { apiClient } from "../../../utils/orpc";

export type KvValueResult = Awaited<ReturnType<typeof apiClient.getValue>>;

export const Route = createFileRoute("/_layout/_authenticated/$key")({
  loader: async ({ params }) => {
    try {
      const data = await apiClient.getValue({ key: params.key });
      return { data };
    } catch (error) {
      return { error: error as Error, data: null };
    }
  },
  component: KeyValue,
});

function KeyValue() {
  const { key } = Route.useParams();
  const { data, error } = Route.useLoaderData();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div>
          <Link
            to="/"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
          >
            ← back
          </Link>
          <h1 className="text-lg font-mono mt-2">Key: {key}</h1>
        </div>
      </div>

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
