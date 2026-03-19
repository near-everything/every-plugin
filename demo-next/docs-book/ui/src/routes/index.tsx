import { useQuery } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import type { ReactNode } from "react";

interface Doc {
	slug: string;
	title: string;
}

export function IndexPage(): ReactNode {
	const { apiUrl } = useRouteContext({ from: "/" });

	const { data, isLoading, error } = useQuery({
		queryKey: ["docs"],
		queryFn: async (): Promise<{ docs: Doc[] }> => {
			const res = await fetch(`${apiUrl}/docs`);
			if (!res.ok) throw new Error("Failed to fetch docs");
			return res.json();
		},
	});

	if (isLoading) return <div>Loading...</div>;
	if (error) return <div>Error: {error.message}</div>;

	return (
		<div>
			<h1>Docs Book</h1>
			<p style={{ color: "#555" }}>Loaded via host → UI remote → API plugin</p>
			<ul>
				{data?.docs.map((doc) => (
					<li key={doc.slug}>
						<Link to="/docs/$slug" params={{ slug: doc.slug }}>
							{doc.title}
						</Link>
					</li>
				))}
			</ul>
		</div>
	);
}
