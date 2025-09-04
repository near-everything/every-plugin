import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Zap, Database, Code } from "lucide-react";
import { orpc } from "@/utils/orpc";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
	component: HomeComponent,
});

function HomeComponent() {
	const healthCheck = useQuery(orpc.healthCheck.queryOptions());

	return (
		<div className="relative min-h-screen flex flex-col items-start justify-center overflow-hidden">
			{/* Content */}
			<div className="relative z-10 max-w-7xl mx-auto px-8 py-20 pt-80">
				<div className="max-w-4xl">
					{/* Main Heading - Large, Off-centered, Left-aligned */}
					<h1 className="text-8xl text-white md:text-9xl lg:text-[12rem] font-bold mb-8 leading-[0.85] tracking-tight">
						every<br />
						<span className="gradient-text">
							plugin
						</span>
					</h1>
					
					{/* Subtitle */}
					<p className="text-2xl md:text-3xl text-muted-foreground mb-12 max-w-2xl leading-relaxed">
						a composable plugin runtime
					</p>

					{/* CTA Buttons */}
					<div className="flex flex-col sm:flex-row gap-4 mb-16">
						<Button asChild className="btn-primary text-lg px-8 py-4">
							<Link to="/ai">
								<Zap className="w-5 h-5 mr-2" />
								Try Plugin Runner
								<ArrowRight className="w-5 h-5 ml-2" />
							</Link>
						</Button>
						<Button asChild variant="outline" className="btn-secondary text-lg px-8 py-4">
							<Link to="/dashboard">
								<Database className="w-5 h-5 mr-2" />
								View Dashboard
							</Link>
						</Button>
					</div>

					{/* API Status */}
					<div className="flex items-center gap-3 text-sm text-muted-foreground">
						<div
							className={`h-2 w-2 rounded-full ${healthCheck.data ? "bg-green-500" : "bg-red-500"}`}
						/>
						<span>
							API Status: {healthCheck.isLoading
								? "Checking..."
								: healthCheck.data
									? "Connected"
									: "Disconnected"}
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
