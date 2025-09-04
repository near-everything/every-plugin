import type { QueryClient } from "@tanstack/react-query";

import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
	useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import Loader from "@/components/loader";
import { Toaster } from "@/components/ui/sonner";
import type { orpc } from "@/utils/orpc";
import Header from "../components/header";
import appCss from "../index.css?url";
export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "My App",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),

	component: RootDocument,
});

function RootDocument() {
	const isFetching = useRouterState({ select: (s) => s.isLoading });

	return (
		<html lang="en" className="dark">
			<head>
				<HeadContent />
			</head>
			<body className="bg-black text-white overflow-x-hidden">
				{/* Global gradient background */}
				<div className="fixed inset-0 -z-10">
					<div className="absolute inset-0 bg-gradient-to-br from-black via-gray-950 to-black" />
					<div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-r from-blue-600/10 to-purple-600/10 rounded-full blur-3xl animate-pulse-gradient" />
					<div className="absolute bottom-0 right-1/4 w-80 h-80 bg-gradient-to-r from-purple-600/10 to-pink-600/10 rounded-full blur-3xl animate-pulse-gradient" />
				</div>

				<div className="relative z-10 grid h-svh grid-rows-[auto_1fr]">
					<Header />
					{isFetching ? (
						<Loader message="Loading application..." variant="default" />
					) : (
						<Outlet />
					)}
				</div>
				
				{/* Enhanced Toaster with glass styling */}
				<Toaster 
					richColors 
					toastOptions={{
						className: "glass-card border-white/20",
						style: {
							background: "rgba(0, 0, 0, 0.8)",
							backdropFilter: "blur(16px)",
							border: "1px solid rgba(255, 255, 255, 0.1)",
							color: "white"
						}
					}}
				/>
				
				<TanStackRouterDevtools position="bottom-left" />
				<ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
				<Scripts />
			</body>
		</html>
	);
}
