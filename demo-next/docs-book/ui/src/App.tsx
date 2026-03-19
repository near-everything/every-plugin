import React from "react";

interface Doc {
	slug: string;
	title: string;
	body?: string;
}

interface AppProps {
	apiUrl?: string;
	hostUrl?: string;
}

export function App({ apiUrl = "/api", hostUrl = "" }: AppProps) {
	const [docs, setDocs] = React.useState<Doc[]>([]);
	const [selectedDoc, setSelectedDoc] = React.useState<Doc | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [error, setError] = React.useState<string | null>(null);

	React.useEffect(() => {
		fetch(`${apiUrl}/docs`)
			.then((res) => res.json())
			.then((data) => {
				setDocs(data.docs);
				setLoading(false);
			})
			.catch((err) => {
				setError(err.message);
				setLoading(false);
			});
	}, [apiUrl]);

	const loadDoc = React.useCallback(
		(slug: string) => {
			setLoading(true);
			fetch(`${apiUrl}/docs/${slug}`)
				.then((res) => res.json())
				.then((data) => {
					setSelectedDoc(data);
					setLoading(false);
				})
				.catch((err) => {
					setError(err.message);
					setLoading(false);
				});
		},
		[apiUrl],
	);

	if (error) {
		return (
			<div style={{ padding: "2rem", color: "red" }}>
				<h1>Error</h1>
				<p>{error}</p>
			</div>
		);
	}

	return (
		<div style={{ fontFamily: "system-ui", padding: "2rem" }}>
			<h1>Docs Book</h1>
			<hr style={{ margin: "1rem 0" }} />

			{selectedDoc ? (
				<div>
					<button
						type="button"
						onClick={() => setSelectedDoc(null)}
						style={{ marginBottom: "1rem" }}
					>
						← Back to docs
					</button>
					<h2>{selectedDoc.title}</h2>
					<pre
						style={{
							whiteSpace: "pre-wrap",
							fontFamily: "monospace",
							background: "#f5f5f5",
							padding: "1rem",
							borderRadius: "4px",
						}}
					>
						{selectedDoc.body}
					</pre>
				</div>
			) : (
				<div>
					<h2>Documentation</h2>
					{loading ? (
						<p>Loading...</p>
					) : (
						<ul>
							{docs.map((doc) => (
								<li key={doc.slug}>
									<a
										href={`/docs/${doc.slug}`}
										onClick={(e) => {
											e.preventDefault();
											loadDoc(doc.slug);
										}}
									>
										{doc.title}
									</a>
								</li>
							))}
						</ul>
					)}
				</div>
			)}
		</div>
	);
}

export default App;
