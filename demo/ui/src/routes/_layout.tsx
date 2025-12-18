import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { sessionQueryOptions } from "../lib/session";
import { authClient } from "../lib/auth-client";
import { ThemeToggle } from "../components/theme-toggle";

export const Route = createFileRoute("/_layout")({
  beforeLoad: async ({ context }) => {
    await context.queryClient.ensureQueryData(sessionQueryOptions);
  },
  component: Layout,
});

function Layout() {
  const { data: session } = useSuspenseQuery(sessionQueryOptions);
  const accountId = session?.user?.id;

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      await authClient.near.disconnect();
      window.location.href = "/";
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col bg-background">
      <header className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-end gap-4">
            <ThemeToggle />
            {accountId ? (
              <>
                <span className="text-xs text-muted-foreground font-mono">
                  {accountId}
                </span>
                <button
                  onClick={handleSignOut}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
                >
                  sign out
                </button>
              </>
            ) : (
              <Link 
                to="/login" 
                className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
              >
                login
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border/50">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <a 
            href="/api" 
            className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
          >
            api
          </a>
        </div>
      </footer>
    </div>
  );
}
