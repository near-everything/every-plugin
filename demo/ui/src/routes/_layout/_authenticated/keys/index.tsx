import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { apiClient, queryClient } from "../../../../utils/orpc";

export const Route = createFileRoute("/_layout/_authenticated/keys/")({
  loader: async () => {
    const data = await apiClient.listKeys({ limit: 50 });
    return { data };
  },
  head: () => ({
    meta: [
      { title: "My Keys | demo.everything" },
      { name: "description", content: "View and manage all your key-value pairs." },
      { property: "og:title", content: "My Keys | demo.everything" },
      { property: "og:description", content: "View and manage all your key-value pairs." },
    ],
  }),
  component: KeysList,
});

function KeysList() {
  const router = useRouter();
  const { data: initialData } = Route.useLoaderData();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const handleBack = () => {
    if (router.history.canGoBack()) {
      router.history.back();
    } else {
      router.navigate({ to: "/" });
    }
  };

  const keysQuery = useSuspenseQuery({
    queryKey: ["keys"],
    queryFn: () => apiClient.listKeys({ limit: 50 }),
    initialData,
  });

  const createMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiClient.setValue({ key, value }),
    onSuccess: async (data) => {
      toast.success(`Key "${data.key}" ${data.created ? "created" : "updated"}`);
      await queryClient.refetchQueries({ queryKey: ["keys"] });
      setNewKey("");
      setNewValue("");
      setShowCreateForm(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create key");
    },
  });

  const generateSampleKeys = useMutation({
    mutationFn: async () => {
      const sampleKeys = Array.from({ length: 25 }, (_, i) => ({
        key: `sample-key-${String(i + 1).padStart(3, "0")}`,
        value: `Sample value for key ${i + 1} - ${new Date().toISOString()}`,
      }));

      await Promise.all(
        sampleKeys.map(({ key, value }) => apiClient.setValue({ key, value }))
      );
      return sampleKeys.length;
    },
    onSuccess: async (count) => {
      toast.success(`Created ${count} sample keys for testing`);
      await queryClient.refetchQueries({ queryKey: ["keys"] });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to generate sample keys");
    },
  });

  const { keys, total, hasMore } = keysQuery.data;

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
          <h1 className="text-lg font-mono mt-2">My Keys</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {total} key{total !== 1 ? "s" : ""} stored
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-3 py-1.5 text-xs font-mono border border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all rounded-md"
          >
            {showCreateForm ? "cancel" : "+ new key"}
          </button>
          {keys.length < 10 && (
            <button
              type="button"
              onClick={() => generateSampleKeys.mutate()}
              disabled={generateSampleKeys.isPending}
              className="px-3 py-1.5 text-xs font-mono border border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all rounded-md disabled:opacity-50"
            >
              {generateSampleKeys.isPending ? "creating..." : "generate 25 samples"}
            </button>
          )}
        </div>
      </div>

      {showCreateForm && (
        <div className="p-4 bg-muted/20 rounded-lg border border-border/50 space-y-3">
          <input
            type="text"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono bg-background border border-border focus:border-ring rounded-md outline-none transition-colors"
            placeholder="key name"
          />
          <input
            type="text"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="w-full px-3 py-2 text-sm font-mono bg-background border border-border focus:border-ring rounded-md outline-none transition-colors"
            placeholder="value"
          />
          <button
            type="button"
            onClick={() => createMutation.mutate({ key: newKey, value: newValue })}
            disabled={createMutation.isPending || !newKey || !newValue}
            className="w-full px-3 py-2 text-sm font-mono bg-primary text-primary-foreground hover:bg-primary/90 rounded-md disabled:opacity-50 transition-colors"
          >
            {createMutation.isPending ? "creating..." : "create key"}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {keys.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <p className="text-sm font-mono">No keys yet</p>
            <p className="text-xs mt-1">Create your first key or generate sample data</p>
          </div>
        ) : (
          keys.map((item, index) => (
            <Link
              key={item.key}
              to="/keys/$key"
              params={{ key: item.key }}
              className="block p-4 bg-muted/10 hover:bg-muted/20 rounded-lg border border-border/50 hover:border-border transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground font-mono w-6 text-right">
                    {index + 1}
                  </span>
                  <span className="font-mono text-sm">{item.key}</span>
                </div>
                <span className="text-xs text-muted-foreground font-mono">
                  {new Date(item.updatedAt).toLocaleDateString()}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>

      {hasMore && (
        <div className="text-center pt-4">
          <p className="text-xs text-muted-foreground font-mono">
            Showing {keys.length} of {total} keys
          </p>
        </div>
      )}
    </div>
  );
}
