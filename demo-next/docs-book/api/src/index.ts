import { createPlugin } from "every-plugin";
import { Effect } from "every-plugin/effect";
import { z } from "every-plugin/zod";
import { contract } from "./contract";

const docs = [
	{
		slug: "intro",
		title: "Introduction",
		body: "# Introduction\n\nWelcome to the Docs Book!\n\nThis is a simple documentation system built with everything-dev-next.",
	},
	{
		slug: "getting-started",
		title: "Getting Started",
		body: "# Getting Started\n\n## Installation\n\n```bash\nnpm install everything-dev-next\n```\n\n## Usage\n\nCreate a bos.config.json and run:\n\n```bash\nnpx everything-dev-next dev\n```",
	},
	{
		slug: "architecture",
		title: "Architecture",
		body: "# Architecture\n\n## Components\n\n- **Host**: Server that orchestrates UI and API\n- **UI**: Remote UI module loaded via Module Federation\n- **API**: Remote API plugin loaded via Module Federation\n\n## Module Federation\n\nAll remotes use mf-manifest.json for discovery.",
	},
];

export default createPlugin({
	variables: z.object({}),
	secrets: z.object({}),
	contract,

	initialize: () => Effect.succeed({}),

	shutdown: () => Effect.void,

	createRouter: (_deps, builder) => ({
		listDocs: builder.listDocs.handler(async () => ({
			docs: docs.map((d) => ({ slug: d.slug, title: d.title })),
		})),

		getDoc: builder.getDoc.handler(async ({ input }) => {
			const doc = docs.find((d) => d.slug === input.slug);
			if (!doc) {
				throw new Error(`Doc not found: ${input.slug}`);
			}
			return doc;
		}),
	}),
});

export { contract };
export type { ContractType } from "./contract";
