import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { toast } from "sonner";

export const Route = createFileRoute("/_layout/_authenticated/_admin")({
	beforeLoad: async ({ context }) => {
		if (!context.auth?.isAdmin) {
			toast.error("Must be role admin to visit this page", {
				id: "admin-role-required",
			});
			throw redirect({
				to: "/",
			});
		}

		return { session: context.auth.session };
	},
	component: () => <Outlet />,
});
