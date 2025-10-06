import { createFileRoute } from "@tanstack/react-router";
import { Play, Square, RefreshCw, Database, Zap, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/ai")({
	component: PluginRunner,
});

type PluginPhase = "idle" | "historical" | "processing" | "realtime" | "error";
type EveryPlugin = {
	id: string;
	content: string;
	contentType: string;
	createdAt: string;
	url: string;
	authors: Array<{ username: string; displayName: string }>;
	raw: any;
};

function PluginRunner() {
	const [query, setQuery] = useState("");
	const [phase, setPhase] = useState<PluginPhase>("idle");
	const [results, setResults] = useState<EveryPlugin[]>([]);
	const [isRunning, setIsRunning] = useState(false);

	// Mock plugin execution simulation
	const executePlugin = async () => {
		if (!query.trim()) return;
		
		setIsRunning(true);
		setResults([]);
		setPhase("historical");

		// Simulate historical phase
		await new Promise(resolve => setTimeout(resolve, 1000));
		setPhase("processing");
		
		// Add historical results
		const historicalResults: EveryPlugin[] = Array.from({ length: 3 }, (_, i) => ({
			id: `hist_${i}`,
			content: `Historical ${query} result ${i + 1}`,
			contentType: "post",
			createdAt: new Date(Date.now() - (i * 60000)).toISOString(),
			url: `https://example.com/hist/${i}`,
			authors: [{ username: "hist_user", displayName: "Historical User" }],
			raw: { type: "historical", index: i, query }
		}));
		
		setResults(historicalResults);
		await new Promise(resolve => setTimeout(resolve, 1500));
		
		// Switch to realtime phase
		setPhase("realtime");
		
		// Simulate realtime updates
		let realtimeCount = 0;
		const realtimeInterval = setInterval(() => {
			if (realtimeCount < 5) {
				const newResult: EveryPlugin = {
					id: `rt_${Date.now()}_${realtimeCount}`,
					content: `Real-time ${query} update ${realtimeCount + 1}`,
					contentType: "post",
					createdAt: new Date().toISOString(),
					url: `https://example.com/realtime/${realtimeCount}`,
					authors: [{ username: "rt_user", displayName: "Real-time User" }],
					raw: { type: "realtime", index: realtimeCount, query }
				};
				
				setResults(prev => [newResult, ...prev]);
				realtimeCount++;
			} else {
				clearInterval(realtimeInterval);
				setIsRunning(false);
			}
		}, 2000);
	};

	const stopExecution = () => {
		setIsRunning(false);
		setPhase("idle");
	};

	const getPhaseIcon = () => {
		switch (phase) {
			case "historical": return <Database className="w-4 h-4" />;
			case "processing": return <RefreshCw className="w-4 h-4 animate-spin" />;
			case "realtime": return <Zap className="w-4 h-4" />;
			case "error": return <Square className="w-4 h-4" />;
			default: return <Play className="w-4 h-4" />;
		}
	};

	const getPhaseColor = () => {
		switch (phase) {
			case "historical": return "status-historical";
			case "processing": return "status-processing";
			case "realtime": return "status-realtime";
			case "error": return "status-error";
			default: return "";
		}
	};

	return (
		<div className="relative min-h-full">
			{/* Gradient Background */}
			<div className="absolute inset-0 opacity-30">
				<div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-pink-600/20" />
				<div className="absolute top-1/4 left-1/3 w-96 h-96 bg-gradient-to-r from-cyan-400/10 to-blue-500/10 rounded-full blur-3xl" />
				<div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-full blur-3xl" />
			</div>

			<div className="relative z-10 grid grid-rows-[auto_1fr] h-full p-6 gap-6">
				{/* Plugin Control Panel */}
				<div className="glass-card rounded-xl p-6">
					<div className="flex items-center gap-4 mb-4">
						<h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
							Plugin Runner
						</h1>
						<Badge variant="outline" className={`${getPhaseColor()} flex items-center gap-2`}>
							{getPhaseIcon()}
							{phase.charAt(0).toUpperCase() + phase.slice(1)}
						</Badge>
					</div>

					<div className="flex gap-4">
						<Input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Enter search query for source plugin..."
							className="flex-1 glass"
							disabled={isRunning}
						/>
						<Button
							onClick={isRunning ? stopExecution : executePlugin}
							disabled={!query.trim() && !isRunning}
							className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
						>
							{isRunning ? (
								<>
									<Square className="w-4 h-4 mr-2" />
									Stop
								</>
							) : (
								<>
									<Play className="w-4 h-4 mr-2" />
									Execute
								</>
							)}
						</Button>
					</div>
				</div>

				{/* Results Area */}
				<div className="overflow-y-auto space-y-4">
					{results.length === 0 && !isRunning ? (
						<div className="glass-card rounded-xl p-8 text-center">
							<div className="text-muted-foreground mb-4">
								<Database className="w-12 h-12 mx-auto mb-4 opacity-50" />
								<p className="text-lg">Ready to execute plugins</p>
								<p className="text-sm">Enter a search query and click Execute to start the plugin runtime</p>
							</div>
						</div>
					) : (
						results.map((result) => (
							<div key={result.id} className="glass-card rounded-xl p-4 hover:bg-white/5 transition-all duration-200">
								<div className="flex items-start justify-between mb-3">
									<div className="flex items-center gap-3">
										<Badge variant="secondary" className="text-xs">
											{result.raw?.type || "unknown"}
										</Badge>
										<div className="flex items-center gap-2 text-sm text-muted-foreground">
											<Clock className="w-3 h-3" />
											{new Date(result.createdAt).toLocaleTimeString()}
										</div>
									</div>
									<div className="text-xs text-muted-foreground">
										{result.authors[0]?.displayName}
									</div>
								</div>
								
								<div className="mb-3">
									<p className="text-white leading-relaxed">{result.content}</p>
								</div>
								
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<span>ID: {result.id}</span>
									<a 
										href={result.url} 
										target="_blank" 
										rel="noopener noreferrer"
										className="text-blue-400 hover:text-blue-300 transition-colors"
									>
										View Source
									</a>
								</div>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
}
