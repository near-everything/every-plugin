import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_layout/_authenticated")({
	ssr: false,
	beforeLoad: async ({ location, context }) => {
		if (!context.auth?.isAuthenticated) {
			throw redirect({
				to: "/login",
				search: {
					redirect: location.pathname,
				},
			});
		}
		return { session: context.auth.session };
	},
	component: () => <Outlet />,
});
