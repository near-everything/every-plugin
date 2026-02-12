// ============================================================================
// Home Route
// ============================================================================
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

function HomeComponent() {
	return (
		<div className="min-h-screen flex items-center justify-center bg-background">
			<div className="text-center">
				<h1 className="text-4xl font-bold mb-4">Everything Dev</h1>
				<p className="text-muted-foreground">
					TanStack Start + Hono + Module Federation
				</p>
			</div>
		</div>
	);
}
