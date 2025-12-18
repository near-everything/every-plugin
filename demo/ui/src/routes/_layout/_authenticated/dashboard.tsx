import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { authClient } from "../../../lib/auth-client";
import { apiClient } from "../../../utils/orpc";
import { toast } from "sonner";

export const Route = createFileRoute("/_layout/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const [kvKey, setKvKey] = useState("mykey");
  const [kvValue, setKvValue] = useState("myvalue");
  const [protectedData, setProtectedData] = useState<any>(null);
  const [kvResult, setKvResult] = useState<any>(null);

  const accountId = authClient.near.getAccountId();

  const protectedMutation = useMutation({
    mutationFn: () => apiClient.protected(),
    onSuccess: (data) => {
      setProtectedData(data);
      toast.success("Protected endpoint called");
    },
    onError: (error: any) => {
      console.error("Error calling protected:", error);
      toast.error(error.message || "Failed to call protected endpoint");
    },
  });

  const setValueMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      apiClient.setValue({ key, value }),
    onSuccess: (data) => {
      setKvResult(data);
      toast.success(`Key "${kvKey}" ${data.created ? "created" : "updated"}`);
    },
    onError: (error: any) => {
      console.error("Error setting value:", error);
      toast.error(error.message || "Failed to set value");
    },
  });

  const getValueMutation = useMutation({
    mutationFn: ({ key }: { key: string }) => apiClient.getValue({ key }),
    onSuccess: (data) => {
      setKvResult(data);
      toast.success(`Retrieved value for "${kvKey}"`);
    },
    onError: (error: any) => {
      console.error("Error getting value:", error);
      toast.error(error.message || "Failed to get value");
      setKvResult(null);
    },
  });

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      await authClient.near.disconnect();
      window.location.href = "/login";
    } catch (error) {
      console.error("Sign out error:", error);
      toast.error("Failed to sign out");
    }
  };

  const isLoading =
    protectedMutation.isPending ||
    setValueMutation.isPending ||
    getValueMutation.isPending;

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between pb-4 border-b border-border/50">
          <span className="text-xs text-muted-foreground font-mono">{accountId}</span>
          <button
            onClick={handleSignOut}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
          >
            sign out
          </button>
        </div>

        <div className="space-y-6">
          <div className="space-y-3">
            <button
              onClick={() => protectedMutation.mutate()}
              disabled={isLoading}
              className="w-full px-5 py-3 text-sm font-mono border border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-left"
            >
              {protectedMutation.isPending
                ? "calling..."
                : "call protected endpoint"}
            </button>

            {protectedData && (
              <div className="p-4 bg-muted/20 rounded-lg border border-border/50">
                <pre className="text-xs font-mono text-muted-foreground overflow-auto">
                  {JSON.stringify(protectedData, null, 2)}
                </pre>
              </div>
            )}
          </div>

          <div className="space-y-3 pt-4 border-t border-border/50">
            <input
              type="text"
              value={kvKey}
              onChange={(e) => setKvKey(e.target.value)}
              className="w-full px-4 py-2.5 text-sm font-mono bg-muted/20 border border-border focus:border-ring rounded-lg outline-none transition-colors"
              placeholder="key"
            />

            <input
              type="text"
              value={kvValue}
              onChange={(e) => setKvValue(e.target.value)}
              className="w-full px-4 py-2.5 text-sm font-mono bg-muted/20 border border-border focus:border-ring rounded-lg outline-none transition-colors"
              placeholder="value"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setValueMutation.mutate({ key: kvKey, value: kvValue })}
                disabled={isLoading || !kvKey || !kvValue}
                className="flex-1 px-4 py-2.5 text-sm font-mono border border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {setValueMutation.isPending ? "setting..." : "set"}
              </button>
              <button
                onClick={() => getValueMutation.mutate({ key: kvKey })}
                disabled={isLoading || !kvKey}
                className="flex-1 px-4 py-2.5 text-sm font-mono border border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {getValueMutation.isPending ? "getting..." : "get"}
              </button>
            </div>

            {kvResult && (
              <div className="p-4 bg-muted/20 rounded-lg border border-border/50">
                <pre className="text-xs font-mono text-muted-foreground overflow-auto">
                  {JSON.stringify(kvResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
