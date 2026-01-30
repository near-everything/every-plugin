import { createServer, type Server } from "node:http";

export interface MockServer {
  port: number;
  server: Server;
  stop: () => void;
  pid: number;
}

export const createMockServer = (port: number): MockServer => {
  const server = createServer((req, res) => {
    res.writeHead(200);
    res.end("ok");
  });
  server.listen(port);

  return {
    port,
    server,
    stop: () => server.close(),
    pid: process.pid,
  };
};

export const createMockServers = (ports: number[]): MockServer[] => {
  return ports.map((port) => createMockServer(port));
};

export const stopAllMockServers = (servers: MockServer[]): void => {
  for (const server of servers) {
    try {
      server.stop();
    } catch {
      // already stopped
    }
  }
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const waitForCondition = async (
  condition: () => Promise<boolean> | boolean,
  timeoutMs = 5000,
  intervalMs = 100
): Promise<boolean> => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return true;
    await sleep(intervalMs);
  }
  return false;
};
