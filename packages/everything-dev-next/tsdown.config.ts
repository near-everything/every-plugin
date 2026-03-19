import { defineConfig } from "tsdown";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/types.ts",
		"src/config.ts",
		"src/shared.ts",
		"src/mf.ts",
		"src/plugin.ts",
		"src/api.ts",
		"src/host.ts",
		"src/cli.ts",
	],
	format: ["cjs", "esm"],
	dts: true,
	clean: true,
	outDir: "dist",
	treeshake: true,
	sourcemap: true,
	minify: false,
	unbundle: true,
	external: [
		"effect",
		"zod",
		/^@orpc\/.*/,
		/^@module-federation\/.*/,
		/^@hono\/.*/,
		"hono",
	],
});
