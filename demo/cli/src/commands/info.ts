import { loadConfig, getRemotes, getHost } from "../config";
import { colors, icons, divider, header, gradients } from "../utils/theme";

export function infoCommand() {
  const config = loadConfig();
  const host = getHost();
  const remotes = getRemotes();

  console.log();
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log(`  ${icons.config} ${gradients.cyber("CONFIGURATION")}`);
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log();

  console.log(
    colors.white("  Account:"),
    colors.cyan(config.account)
  );
  console.log(colors.white("  Title:  "), colors.cyan(host.title));
  if (host.description) {
    console.log(colors.white("  About:  "), colors.dim(host.description));
  }
  console.log();

  console.log(`  ${icons.host} ${colors.bold("Host")}`);
  console.log(colors.dim("  |- dev: "), host.development);
  console.log(colors.dim("  |- prod:"), host.production);
  console.log();

  console.log(`  ${icons.pkg} ${colors.bold(`Remotes (${remotes.length})`)}`);
  for (const name of remotes) {
    const remote = config.app[name];
    if (!remote || !("name" in remote)) continue;

    console.log(colors.white(`  |-- ${name}`));
    console.log(colors.dim("  |   |- dev: "), remote.development);
    console.log(colors.dim("  |   |- prod:"), remote.production);
    if (remote.ssr) {
      console.log(colors.dim("  |   |- ssr: "), remote.ssr);
    }
    if (remote.exposes) {
      const keys = Object.keys(remote.exposes);
      console.log(colors.dim("  |   |- exposes:"), keys.join(", "));
    }
    if (remote.secrets?.length) {
      console.log(colors.dim("  |   |- secrets:"), remote.secrets.join(", "));
    }
  }
  console.log();
}
