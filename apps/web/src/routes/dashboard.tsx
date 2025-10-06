import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Activity, Database, Zap, Clock, CheckCircle, XCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/dashboard")({
	component: RouteComponent,
});

function RouteComponent() {
	const navigate = Route.useNavigate();
	const { data: session, isPending } = authClient.useSession();

	const privateData = useQuery(orpc.privateData.queryOptions());

	useEffect(() => {
		if (!session && !isPending) {
			navigate({
				to: "/login",
			});
		}
	}, [session, isPending]);

	if (isPending) {
		return (
			<div className="flex items-center justify-center min-h-full">
				<div className="glass-card rounded-xl p-8">
					<div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
					<p className="text-center mt-4 text-muted-foreground">Loading dashboard...</p>
				</div>
			</div>
		);
	}

	// Mock plugin registry data
	const pluginRegistry = [
		{
			id: "source-template",
			name: "Source Template Plugin",
			version: "1.0.0",
			status: "active",
			lastExecution: "2 minutes ago",
			executions: 142,
			remoteUrl: "https://cdn.example.com/plugins/source-template/remoteEntry.js"
		},
		{
			id: "data-processor",
			name: "Data Processor",
			version: "2.1.0",
			status: "active",
			lastExecution: "5 minutes ago",
			executions: 89,
			remoteUrl: "https://cdn.example.com/plugins/processor/remoteEntry.js"
		},
		{
			id: "analytics-sink",
			name: "Analytics Sink",
			version: "1.5.2",
			status: "inactive",
			lastExecution: "1 hour ago",
			executions: 23,
			remoteUrl: "https://cdn.example.com/plugins/analytics/remoteEntry.js"
		}
	];

	const recentExecutions = [
		{ id: "exec_1", plugin: "source-template", status: "completed", duration: "2.3s", timestamp: "2 min ago" },
		{ id: "exec_2", plugin: "data-processor", status: "completed", duration: "1.8s", timestamp: "5 min ago" },
		{ id: "exec_3", plugin: "source-template", status: "failed", duration: "0.5s", timestamp: "8 min ago" },
		{ id: "exec_4", plugin: "analytics-sink", status: "completed", duration: "3.1s", timestamp: "1 hour ago" },
	];

	return (
		<div className="relative min-h-full">
			{/* Gradient Background */}
			<div className="absolute inset-0 opacity-20">
				<div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-pink-600/20" />
				<div className="absolute top-1/4 right-1/3 w-96 h-96 bg-gradient-to-r from-cyan-400/10 to-blue-500/10 rounded-full blur-3xl" />
				<div className="absolute bottom-1/3 left-1/4 w-80 h-80 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-full blur-3xl" />
			</div>

			<div className="relative z-10 p-6 space-y-6">
				{/* Header */}
				<div className="glass-card rounded-xl p-6">
					<div className="flex items-center justify-between">
						<div>
							<h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
								Plugin Dashboard
							</h1>
							<p className="text-muted-foreground mt-2">
								Welcome back, {session?.user.name}
							</p>
						</div>
						<div className="flex items-center gap-4">
							<Badge variant="outline" className="status-realtime">
								<Activity className="w-3 h-3 mr-1" />
								Runtime Active
							</Badge>
						</div>
					</div>
				</div>

				{/* Stats Grid */}
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
					<Card className="glass-card p-4">
						<div className="flex items-center gap-3">
							<div className="p-2 bg-blue-500/20 rounded-lg">
								<Database className="w-5 h-5 text-blue-400" />
							</div>
							<div>
								<p className="text-sm text-muted-foreground">Total Plugins</p>
								<p className="text-2xl font-bold">{pluginRegistry.length}</p>
							</div>
						</div>
					</Card>

					<Card className="glass-card p-4">
						<div className="flex items-center gap-3">
							<div className="p-2 bg-green-500/20 rounded-lg">
								<CheckCircle className="w-5 h-5 text-green-400" />
							</div>
							<div>
								<p className="text-sm text-muted-foreground">Active Plugins</p>
								<p className="text-2xl font-bold">
									{pluginRegistry.filter(p => p.status === "active").length}
								</p>
							</div>
						</div>
					</Card>

					<Card className="glass-card p-4">
						<div className="flex items-center gap-3">
							<div className="p-2 bg-purple-500/20 rounded-lg">
								<Zap className="w-5 h-5 text-purple-400" />
							</div>
							<div>
								<p className="text-sm text-muted-foreground">Total Executions</p>
								<p className="text-2xl font-bold">
									{pluginRegistry.reduce((sum, p) => sum + p.executions, 0)}
								</p>
							</div>
						</div>
					</Card>

					<Card className="glass-card p-4">
						<div className="flex items-center gap-3">
							<div className="p-2 bg-orange-500/20 rounded-lg">
								<Clock className="w-5 h-5 text-orange-400" />
							</div>
							<div>
								<p className="text-sm text-muted-foreground">Avg Duration</p>
								<p className="text-2xl font-bold">2.1s</p>
							</div>
						</div>
					</Card>
				</div>

				{/* Plugin Registry */}
				<div className="glass-card rounded-xl p-6">
					<h2 className="text-xl font-semibold mb-4">Plugin Registry</h2>
					<div className="space-y-3">
						{pluginRegistry.map((plugin) => (
							<div key={plugin.id} className="glass rounded-lg p-4 hover:bg-white/5 transition-all duration-200">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-4">
										<div className="flex items-center gap-3">
											<Badge variant="secondary" className="text-xs">
												"TYPE"
											</Badge>
											<div>
												<h3 className="font-medium">{plugin.name}</h3>
												<p className="text-sm text-muted-foreground">v{plugin.version}</p>
											</div>
										</div>
									</div>
									<div className="flex items-center gap-4">
										<div className="text-right text-sm">
											<p className="text-muted-foreground">Last execution</p>
											<p>{plugin.lastExecution}</p>
										</div>
										<div className="text-right text-sm">
											<p className="text-muted-foreground">Executions</p>
											<p className="font-medium">{plugin.executions}</p>
										</div>
										<Badge 
											variant={plugin.status === "active" ? "default" : "secondary"}
											className={plugin.status === "active" ? "status-realtime" : ""}
										>
											{plugin.status === "active" ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
											{plugin.status}
										</Badge>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>

				{/* Recent Executions */}
				<div className="glass-card rounded-xl p-6">
					<h2 className="text-xl font-semibold mb-4">Recent Executions</h2>
					<div className="space-y-3">
						{recentExecutions.map((execution) => (
							<div key={execution.id} className="glass rounded-lg p-3 flex items-center justify-between">
								<div className="flex items-center gap-3">
									<Badge variant="outline" className="text-xs">
										{execution.plugin}
									</Badge>
									<span className="text-sm text-muted-foreground">{execution.timestamp}</span>
								</div>
								<div className="flex items-center gap-3">
									<span className="text-sm text-muted-foreground">{execution.duration}</span>
									<Badge 
										variant={execution.status === "completed" ? "default" : "destructive"}
										className={execution.status === "completed" ? "status-realtime" : "status-error"}
									>
										{execution.status === "completed" ? <CheckCircle className="w-3 h-3 mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
										{execution.status}
									</Badge>
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
