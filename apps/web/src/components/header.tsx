import { Link } from "@tanstack/react-router";
import UserMenu from "./user-menu";

export default function Header() {
	const links = [
		{ to: "/", label: "Home" },
		{ to: "/dashboard", label: "Dashboard" },
		{ to: "/ai", label: "Plugin Runner" },
	] as const;

	return (
		<div className="relative">
			{/* Gradient background overlay */}
			<div className="absolute inset-0 bg-gradient-to-r from-black via-gray-900 to-black opacity-95 backdrop-blur-sm" />
			
			{/* Subtle animated gradient accent */}
			<div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 animate-pulse" />
			
			<div className="relative z-10 flex flex-row items-center justify-between px-6 py-4">
				{/* Logo/Brand */}
				<div className="flex items-center gap-8">
					<Link to="/" className="text-2xl font-bold text-white hover:text-gray-300 transition-colors">
						<span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
							every
						</span>
						<span className="text-white">plugin</span>
					</Link>
					
					{/* Navigation */}
					<nav className="flex gap-6">
						{links.map(({ to, label }) => {
							return (
								<Link 
									key={to} 
									to={to}
									className="flex items-center justify-center text-white text-base leading-[110%] px-3 py-2 rounded-md hover:bg-white/10 hover:text-white transition-all duration-200 font-medium"
									activeProps={{
										className: "bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-white border border-white/20 backdrop-blur-sm"
									}}
								>
									{label}
								</Link>
							);
						})}
					</nav>
				</div>
				
				{/* User Menu */}
				<div className="flex items-center gap-4">
					<UserMenu />
				</div>
			</div>
			
			{/* Gradient border */}
			<div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
		</div>
	);
}
