import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { sessionQueryOptions } from "../../lib/session";

export const Route = createFileRoute("/_layout/")({
  component: Home,
});

function Home() {
  const { data: session } = useSuspenseQuery(sessionQueryOptions);
  const isAuthenticated = !!session?.user;

  return (
    <div className="max-w-3xl mx-auto px-6 py-24 flex flex-col items-center justify-center min-h-[70vh]">
      <div className="w-full space-y-8">
        <div className="flex flex-col gap-4 w-full max-w-sm mx-auto">
          {!isAuthenticated && (
            <Link to="/login">
              <button className="w-full px-6 py-3 text-sm font-mono border border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all rounded-lg">
                connect wallet
              </button>
            </Link>
          )}
          
          {isAuthenticated && (
            <Link to="/dashboard">
              <button className="w-full px-6 py-3 text-sm font-mono border border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40 transition-all rounded-lg">
                dashboard
              </button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
