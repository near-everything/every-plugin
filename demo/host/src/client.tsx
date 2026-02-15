/**
 * Client Application Entry
 *
 * This file is loaded asynchronously by index.ts after MF runtime is ready.
 * It handles client-side hydration of the React application.
 */
import { QueryClient } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import React from "react";
import { hydrateRoot } from "react-dom/client";
import { getRouter } from "./router";

async function main() {
	// Get the router (this loads UI via MF runtime)
	const router = await getRouter();

	// Wait for router to be ready (loads initial route data)
	await router.load();

	// Hydrate the SSR HTML
	hydrateRoot(document, <RouterProvider router={router} />);
}

main().catch((err) => {
	console.error("[Client] Failed to initialize:", err);
});
