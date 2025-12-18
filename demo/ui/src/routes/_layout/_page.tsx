import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/_page")({
  component: PageLayout,
});

function PageLayout() {
  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-12">
      <Outlet />
    </div>
  );
}
