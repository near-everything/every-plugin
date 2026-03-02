import fs from "node:fs";
import path from "node:path";

type MfMeta = {
	remoteEntry?: unknown;
	publicPath?: unknown;
	ssrRemoteEntry?: unknown;
	ssrPublicPath?: unknown;
};

type MfJson = {
	metaData?: MfMeta;
};

function readJson(filePath: string): MfJson {
	return JSON.parse(fs.readFileSync(filePath, "utf8")) as MfJson;
}

function writeJson(filePath: string, data: unknown) {
	fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function merge(clientJson: MfJson, ssrJson: MfJson): MfJson {
	const clientMeta = (clientJson.metaData ??= {});
	const ssrMeta = (ssrJson.metaData ??= {});

	clientMeta.ssrRemoteEntry = ssrMeta.remoteEntry;
	if ("publicPath" in clientMeta) {
		clientMeta.ssrPublicPath = ssrMeta.publicPath;
	}

	return clientJson;
}

const root = path.resolve(import.meta.dirname, "..");
const clientManifest = path.join(root, "dist", "mf-manifest.json");
const ssrManifest = path.join(root, "dist", "ssr", "mf-manifest.json");
const clientStats = path.join(root, "dist", "mf-stats.json");
const ssrStats = path.join(root, "dist", "ssr", "mf-stats.json");

const haveClient = fs.existsSync(clientManifest) && fs.existsSync(clientStats);
const haveSsr = fs.existsSync(ssrManifest) && fs.existsSync(ssrStats);

if (!haveClient || !haveSsr) {
	const missing = [
		!fs.existsSync(clientManifest) ? clientManifest : null,
		!fs.existsSync(clientStats) ? clientStats : null,
		!fs.existsSync(ssrManifest) ? ssrManifest : null,
		!fs.existsSync(ssrStats) ? ssrStats : null,
	].filter(Boolean);

	console.log(
		`[ui] Skipping MF manifest merge (missing: ${missing.join(", ")})`,
	);
	process.exit(0);
}

const mergedManifest = merge(readJson(clientManifest), readJson(ssrManifest));
const mergedStats = merge(readJson(clientStats), readJson(ssrStats));

writeJson(clientManifest, mergedManifest);
writeJson(clientStats, mergedStats);

console.log("[ui] Merged mf-manifest.json + mf-stats.json with SSR metadata");
