import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_layout/_authenticated/_admin/dashboard"
)({
  component: AdminDashboard,
});

function AdminDashboard() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <h1 className="text-lg font-mono">Admin Dashboard</h1>
        <Link
          to="/"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors font-mono"
        >
          ← back
        </Link>
      </div>

      <div className="space-y-4">
        <div className="p-6 bg-muted/20 rounded-lg border border-border/50">
          <p className="text-xs text-muted-foreground">
            This dashboard is protected for authenticated users with role
            "admin" only.
          </p>
        </div>
      </div>
    </div>
  );
}
