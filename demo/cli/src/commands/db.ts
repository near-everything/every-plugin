import { getPackages } from "../config";
import { run } from "../utils/run";
import { colors, icons, gradients } from "../utils/theme";

interface DbOptions {
  filter?: string;
}

const VALID_ACTIONS = ["migrate", "studio", "generate", "push", "sync"] as const;
type DbAction = (typeof VALID_ACTIONS)[number];

export async function dbCommand(action: string, options: DbOptions) {
  const packages = getPackages();
  const filter = options.filter ?? "host";

  if (!packages.includes(filter)) {
    console.error(colors.magenta(`${icons.err} Unknown package: ${filter}`));
    console.log(colors.dim(`   Available: ${packages.join(", ")}`));
    process.exit(1);
  }

  if (!VALID_ACTIONS.includes(action as DbAction)) {
    console.error(colors.magenta(`${icons.err} Unknown action: ${action}`));
    console.log(colors.dim(`   Available: ${VALID_ACTIONS.join(", ")}`));
    process.exit(1);
  }

  console.log();
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log(`  ${icons.db} ${gradients.cyber(`DATABASE ${action.toUpperCase()}`)}`);
  console.log(colors.cyan(`+${"-".repeat(46)}+`));
  console.log();

  switch (action) {
    case "migrate":
    case "studio":
    case "generate":
    case "push":
      await run("turbo", [`db:${action}`, `--filter=${filter}`]);
      break;
    case "sync":
      await run("bun", ["run", "scripts/sync-db.ts"]);
      break;
  }

  console.log();
  console.log(colors.neonGreen(`  ${icons.ok} db:${action} complete`));
  console.log();
}
