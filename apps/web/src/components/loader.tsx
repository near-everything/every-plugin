import { Loader2, Database, Zap } from "lucide-react";

interface LoaderProps {
	message?: string;
	variant?: "default" | "plugin" | "execution";
}

export default function Loader({ message = "Loading...", variant = "default" }: LoaderProps) {
	const getIcon = () => {
		switch (variant) {
			case "plugin":
				return <Database className="animate-pulse w-8 h-8 text-blue-400" />;
			case "execution":
				return <Zap className="animate-bounce w-8 h-8 text-purple-400" />;
			default:
				return <Loader2 className="animate-spin w-8 h-8 text-white" />;
		}
	};

	const getGradientClasses = () => {
		switch (variant) {
			case "plugin":
				return "from-blue-600/20 to-cyan-600/20";
			case "execution":
				return "from-purple-600/20 to-pink-600/20";
			default:
				return "from-blue-600/20 to-purple-600/20";
		}
	};

	return (
		<div className="flex h-full items-center justify-center pt-8">
			<div className="glass-card rounded-xl p-8 text-center">
				{/* Animated gradient background */}
				<div className={`absolute inset-0 bg-gradient-to-r ${getGradientClasses()} rounded-xl animate-pulse-gradient`} />
				
				<div className="relative z-10">
					<div className="mb-4 flex justify-center">
						{getIcon()}
					</div>
					<p className="text-white font-medium">{message}</p>
					{variant === "execution" && (
						<p className="text-muted-foreground text-sm mt-2">
							Processing plugin runtime...
						</p>
					)}
					{variant === "plugin" && (
						<p className="text-muted-foreground text-sm mt-2">
							Loading plugin registry...
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
