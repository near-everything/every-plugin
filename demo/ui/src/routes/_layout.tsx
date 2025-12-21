import { useSuspenseQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  Outlet,
  useRouter,
} from "@tanstack/react-router";
import { ThemeToggle } from "../components/theme-toggle";
import { authClient } from "../lib/auth-client";
import { sessionQueryOptions } from "../lib/session";
import { queryClient } from "../utils/orpc";

export const Route = createFileRoute("/_layout")({
  beforeLoad: async ({ context }) => {
    await context.queryClient.ensureQueryData(sessionQueryOptions);
  },
  component: Layout,
});

function Layout() {
  const router = useRouter();
  const { data: session } = useSuspenseQuery(sessionQueryOptions);
  const accountId = session?.user?.id;

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      await authClient.near.disconnect();
      queryClient.invalidateQueries({ queryKey: ["session"] });
      router.invalidate();
      window.location.href = "/";
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  return (
    <div className="h-dvh w-full flex flex-col bg-background text-foreground overflow-hidden">
      <header className="shrink-0 border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-end gap-4">
            <ThemeToggle />
            {accountId ? (
              <>
                <span className="text-xs text-muted-foreground font-mono">
                  {accountId}
                </span>
                <button
                  type="button"
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

      <main className="flex-1 w-full min-h-0 overflow-auto">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <Outlet />
        </div>
      </main>

      <footer className="shrink-0 border-t border-border/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
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
