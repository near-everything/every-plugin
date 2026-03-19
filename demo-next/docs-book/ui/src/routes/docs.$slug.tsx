import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useRouteContext } from "@tanstack/react-router";
import type { ReactNode } from "react";

interface Doc {
	slug: string;
	title: string;
	body: string;
}

export function DocPage(): ReactNode {
	const { slug } = useParams({ from: "/docs/$slug" });
	const { apiUrl } = useRouteContext({ from: "/docs/$slug" });

	const { data, isLoading, error } = useQuery({
		queryKey: ["doc", slug],
		queryFn: async (): Promise<Doc> => {
			const res = await fetch(`${apiUrl}/docs/${slug}`);
			if (!res.ok) throw new Error("Failed to fetch doc");
			return res.json();
		},
	});

	if (isLoading) return <div>Loading...</div>;
	if (error) return <div>Error: {error.message}</div>;

	return (
		<div>
			<p>
				<Link to="/">Back to docs</Link>
			</p>
			<h1>{data?.title}</h1>
			<pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>
				{data?.body}
			</pre>
		</div>
	);
}
