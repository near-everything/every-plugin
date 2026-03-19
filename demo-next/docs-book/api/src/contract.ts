import { oc } from "every-plugin/orpc";
import { z } from "every-plugin/zod";

export const contract = oc.router({
	listDocs: oc.route({ method: "GET", path: "/docs" }).output(
		z.object({
			docs: z.array(
				z.object({
					slug: z.string(),
					title: z.string(),
				}),
			),
		}),
	),

	getDoc: oc
		.route({ method: "GET", path: "/docs/{slug}" })
		.input(
			z.object({
				slug: z.string(),
			}),
		)
		.output(
			z.object({
				slug: z.string(),
				title: z.string(),
				body: z.string(),
			}),
		),
});

export type ContractType = typeof contract;
