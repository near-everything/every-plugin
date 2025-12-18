import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_layout/_authenticated/_admin")({
  beforeLoad: async () => {
    const { data: session } = await authClient.getSession();

    // Check if user has admin role
    const user = session?.user as { role?: string };
    if (user.role !== "admin") {
      toast.error("Must be role admin to visit this page", { id: "admin-role-required" });
      throw redirect({
        to: "/",
      });
    }

    return { session };
  },
  component: () => <Outlet />,
});
