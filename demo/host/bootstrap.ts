#!/usr/bin/env bun
import "dotenv/config";
import { createInstance, getInstance } from "@module-federation/enhanced/runtime";
import { setGlobalFederationInstance } from "@module-federation/runtime-core";

interface ServerHandle {
  ready: Promise<void>;
  shutdown: () => Promise<void>;
}

function getRemoteUrl(): string {
  const url = process.env.HOST_REMOTE_URL;
  if (!url) {
    console.error("❌ HOST_REMOTE_URL environment variable is required");
    console.error("   Set it to the Zephyr URL of your deployed host bundle");
    process.exit(1);
  }
  return url;
}

async function bootstrap() {
  const remoteUrl = getRemoteUrl();
  
  console.log("🚀 Bootstrapping host from remote...");
  console.log(`   Remote URL: ${remoteUrl}`);

  let serverHandle: ServerHandle | null = null;

  const shutdown = async () => {
    console.log("\n[Bootstrap] Shutting down...");
    if (serverHandle) {
      await serverHandle.shutdown();
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  try {
    let mf = getInstance();
    if (!mf) {
      mf = createInstance({
        name: "bootstrap-host",
        remotes: [],
      });
      setGlobalFederationInstance(mf);
    }

    const remoteEntryUrl = remoteUrl.endsWith("/remoteEntry.js")
      ? remoteUrl
      : `${remoteUrl}/remoteEntry.js`;

    console.log(`   Loading: ${remoteEntryUrl}`);

    mf.registerRemotes([{
      name: "host",
      entry: remoteEntryUrl,
    }]);

    console.log("   Loading host/Server module...");
    const hostModule = await mf.loadRemote<{ runServer: () => ServerHandle }>("host/Server");

    if (!hostModule?.runServer) {
      throw new Error("Host module does not export runServer function");
    }

    console.log("   Starting server...");
    serverHandle = hostModule.runServer();
    
    await serverHandle.ready;
    console.log("✅ Server ready");

    await new Promise(() => {});
  } catch (error) {
    console.error("❌ Failed to bootstrap host:", error);
    process.exit(1);
  }
}

bootstrap();
