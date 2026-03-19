import { Link, Outlet } from "@tanstack/react-router";

export function RootLayout() {
	return (
		<div
			style={{
				fontFamily: "system-ui",
				padding: "2rem",
				maxWidth: 960,
				margin: "0 auto",
			}}
		>
			<nav style={{ marginBottom: "1.5rem" }}>
				<Link to="/">Docs Book</Link>
			</nav>
			<Outlet />
		</div>
	);
}
