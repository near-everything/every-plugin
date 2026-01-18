import { ClientOnly, createFileRoute, Outlet } from "@tanstack/react-router";
import { ThemeToggle } from "../components/theme-toggle";
import { UserNav } from "../components/user-nav";

export const Route = createFileRoute("/_layout")({
  component: Layout,
});

function Layout() {
  return (
    <div className="h-dvh w-full flex flex-col bg-background text-foreground overflow-hidden">
      <header className="shrink-0 border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-end gap-4">
            <ThemeToggle />
            <ClientOnly fallback={<span className="text-xs text-muted-foreground font-mono">...</span>}>
              <UserNav />
            </ClientOnly>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full min-h-0 overflow-auto flex justify-center">
        <div className="w-full max-w-3xl px-4 sm:px-6 py-8 sm:py-12">
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
