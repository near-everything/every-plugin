import { loadConfig, getRemotes, getHost } from "../config";
import { renderStatusView } from "../components/status-view";

export async function statusCommand(options: {
  env?: "development" | "production";
}) {
  const config = loadConfig();
  const host = getHost();
  const remotes = getRemotes();
  const env = options.env ?? "development";

  interface Endpoint {
    name: string;
    url: string;
    type: "host" | "remote" | "ssr";
  }

  const endpoints: Endpoint[] = [];

  endpoints.push({
    name: "host",
    url: host[env],
    type: "host",
  });

  for (const name of remotes) {
    const remote = config.app[name];
    if (!remote || !("name" in remote)) continue;

    endpoints.push({
      name,
      url: remote[env],
      type: "remote",
    });

    if (remote.ssr && env === "production") {
      endpoints.push({
        name: `${name}/ssr`,
        url: remote.ssr,
        type: "ssr",
      });
    }
  }

  await renderStatusView(endpoints, env);
}
