import { exec } from "child_process";
import { promisify } from "util";
import * as path from "path";
import * as dotenv from "dotenv";
import { parse } from "pg-connection-string";
import * as fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const execAsync = promisify(exec);

async function seedRemote() {
  console.log("Starting remote seeding process...");

  // --- Configure your Database URLs ---
  const SOURCE_DATABASE_URL = process.env.SOURCE_DATABASE_URL;
  const TARGET_DATEBASE_URL = process.env.DATABASE_URL;

  if (!SOURCE_DATABASE_URL) {
    console.error(
      "Error: SOURCE_DATABASE_URL environment variable is required.",
    );
    process.exit(1);
  }

  if (!TARGET_DATEBASE_URL) {
    console.error(
      "Error: TARGET_DATEBASE_URL environment variable is required.",
    );
    console.error(
      "Please set the DATABASE_URL environment variable for your local database.",
    );
    process.exit(1);
  }

  let dumpFilePath;

  try {
    // --- Parse Database URLs ---
    const railwayConfig = parse(SOURCE_DATABASE_URL);
    const localConfig = parse(TARGET_DATEBASE_URL);

    // Validate parsed configurations
    if (
      !railwayConfig.host ||
      !railwayConfig.user ||
      !railwayConfig.password ||
      !railwayConfig.database
    ) {
      console.error("Error: Could not parse SOURCE_DATABASE_URL correctly.");
      process.exit(1);
    }
    if (
      !localConfig.host ||
      !localConfig.user ||
      !localConfig.password ||
      !localConfig.database
    ) {
      console.error(
        "Error: Could not parse TARGET_DATEBASE_URL (DATABASE_URL) correctly.",
      );
      process.exit(1);
    }

    const dumpFileName = "railway_dump.sql";
    dumpFilePath = path.join(__dirname, dumpFileName);

    // --- Step 1: Dump data from Railway database ---
    console.log(
      `Dumping data from Railway database '${railwayConfig.database}'...`,
    );
    const dumpCommand = `PGPASSWORD="${railwayConfig.password}" pg_dump -h ${railwayConfig.host} -p ${railwayConfig.port || "5432"} -U ${railwayConfig.user} -d ${railwayConfig.database} -Fp > ${dumpFilePath}`;
    console.log(`Executing dump command: ${dumpCommand}`); // Log command for debugging
    await execAsync(dumpCommand);
    console.log(`Dump created at ${dumpFilePath}`);

    // --- Step 2: Clear local database (optional but recommended for a fresh sync) ---
    console.log(`Clearing local database '${localConfig.database}'...`);
    // You might want to be more selective here, or drop/recreate the database entirely
    // For simplicity, we'll just TRUNCATE common tables. Customize as needed.
    const truncateCommand = `PGPASSWORD="${localConfig.password}" psql -h ${localConfig.host} -p ${localConfig.port || "5432"} -U ${localConfig.user} -d ${localConfig.database} -c "
      TRUNCATE TABLE feeds CASCADE;
      TRUNCATE TABLE submissions CASCADE;
      TRUNCATE TABLE submission_feeds CASCADE;
      TRUNCATE TABLE moderation_history CASCADE;
      TRUNCATE TABLE feed_plugins CASCADE;
      TRUNCATE TABLE submission_counts CASCADE;
      TRUNCATE TABLE twitter_cookies CASCADE;
      TRUNCATE TABLE twitter_cache CASCADE;
    "`;
    console.log(`Executing truncate command: ${truncateCommand}`); // Log command for debugging
    await execAsync(truncateCommand);
    console.log("Local database cleared.");

    // --- Step 3: Restore data to local database ---
    console.log(
      `Restoring data to local database '${localConfig.database}'...`,
    );
    // *** FIX: Use psql -f for restoring plain text dumps ***
    const restoreCommand = `PGPASSWORD="${localConfig.password}" psql -h ${localConfig.host} -p ${localConfig.port || "5432"} -U ${localConfig.user} -d ${localConfig.database} -f ${dumpFilePath}`;
    console.log(`Executing restore command: ${restoreCommand}`); // Log command for debugging
    await execAsync(restoreCommand);
    console.log("Data restored to local database.");

    console.log("Remote seeding process completed successfully!");
  } catch (error: any) {
    console.error("Error during remote seeding:", error.message);
    console.error("Details:", error);
    process.exit(1);
  } finally {
    // Clean up the dump file
    try {
      if (fs.existsSync(dumpFilePath as fs.PathLike)) {
        fs.unlinkSync(dumpFilePath as fs.PathLike);
        console.log(`Cleaned up dump file: ${dumpFilePath}`);
      }
    } catch (cleanupError: any) {
      console.error("Error cleaning up dump file:", cleanupError.message);
    }
  }
}

seedRemote();
