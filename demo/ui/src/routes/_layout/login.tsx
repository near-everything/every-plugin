import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { authClient } from "../../lib/auth-client";
import { toast } from "sonner";
import { queryClient } from "../../utils/orpc";

type SearchParams = {
  redirect?: string;
};

export const Route = createFileRoute("/_layout/login")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const { data: session } = await authClient.getSession();
    if (session?.user) {
      throw redirect({ to: search.redirect || "/" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();

  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [isSigningInWithNear, setIsSigningInWithNear] = useState(false);
  const [isDisconnectingWallet, setIsDisconnectingWallet] = useState(false);

  const accountId = authClient.near.getAccountId();

  const handleWalletConnect = async () => {
    setIsConnectingWallet(true);
    try {
      await authClient.requestSignIn.near(
        { recipient: process.env.PUBLIC_ACCOUNT_ID || "every.near" },
        {
          onSuccess: () => {
            setIsConnectingWallet(false);
            toast.success("Wallet connected");
          },
          onError: (error: any) => {
            setIsConnectingWallet(false);
            console.error("Wallet connection failed:", error);
            const errorMessage =
              error.code === "SIGNER_NOT_AVAILABLE"
                ? "NEAR wallet not available"
                : error.message || "Failed to connect wallet";
            toast.error(errorMessage);
          },
        }
      );
    } catch (error) {
      setIsConnectingWallet(false);
      console.error("Wallet connection error:", error);
      toast.error("Failed to connect to NEAR wallet");
    }
  };

  const handleNearSignIn = async () => {
    setIsSigningInWithNear(true);
    try {
      await authClient.signIn.near(
        { recipient: process.env.PUBLIC_ACCOUNT_ID || "every.near" },
        {
          onSuccess: () => {
            setIsSigningInWithNear(false);
            queryClient.invalidateQueries();
            navigate({ to: redirect ?? "/", replace: true });
            toast.success(`Signed in as: ${accountId}`);
          },
          onError: (error: any) => {
            setIsSigningInWithNear(false);
            console.error("NEAR sign in error:", error);

            if ((error as any)?.code === "NONCE_NOT_FOUND") {
              toast.error("Session expired. Please reconnect your wallet.");
              handleWalletDisconnect();
              return;
            }

            toast.error(
              error instanceof Error ? error.message : "Authentication failed"
            );
          },
        }
      );
    } catch (error) {
      setIsSigningInWithNear(false);
      console.error("NEAR sign in error:", error);

      if ((error as any)?.code === "NONCE_NOT_FOUND") {
        toast.error("Session expired. Please reconnect your wallet.");
        handleWalletDisconnect();
        return;
      }

      toast.error("Authentication failed");
    }
  };

  const handleWalletDisconnect = async () => {
    setIsDisconnectingWallet(true);
    try {
      await authClient.signOut();
      await authClient.near.disconnect();
      queryClient.invalidateQueries();
      setIsDisconnectingWallet(false);
      toast.success("Wallet disconnected successfully");
    } catch (error) {
      setIsDisconnectingWallet(false);
      console.error("Wallet disconnect error:", error);
      toast.error("Failed to disconnect wallet");
    }
  };

  const isLoading =
    isConnectingWallet ||
    isSigningInWithNear ||
    isDisconnectingWallet;

  return (
    <div className="min-h-[80vh] w-full flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-3">
        {!accountId ? (
          <button
            onClick={handleWalletConnect}
            disabled={isLoading}
            className="w-full px-6 py-4 text-sm font-mono border border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnectingWallet ? "connecting..." : "connect near wallet"}
          </button>
        ) : (
          <>
            <button
              onClick={handleNearSignIn}
              disabled={isLoading}
              className="w-full px-6 py-4 text-sm font-mono border border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSigningInWithNear ? "signing in..." : `sign in as ${accountId}`}
            </button>
            <button
              onClick={handleWalletDisconnect}
              disabled={isLoading}
              className="w-full px-6 py-3 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDisconnectingWallet ? "disconnecting..." : "disconnect"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
