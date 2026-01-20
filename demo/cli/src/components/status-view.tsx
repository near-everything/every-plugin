import React, { useState, useEffect } from "react";
import { render, Text, Box } from "ink";
import { colors, icons, gradients, divider } from "../utils/theme";

interface Endpoint {
  name: string;
  url: string;
  type: "host" | "remote" | "ssr";
}

interface StatusResult {
  ok: boolean;
  ms: number;
}

interface StatusViewProps {
  endpoints: Endpoint[];
  env: string;
  onComplete?: () => void;
}

async function checkHealth(url: string): Promise<StatusResult> {
  const start = Date.now();
  try {
    const response = await fetch(url, { method: "HEAD" });
    return { ok: response.ok, ms: Date.now() - start };
  } catch {
    return { ok: false, ms: Date.now() - start };
  }
}

function StatusRow({
  name,
  url,
  status,
}: {
  name: string;
  url: string;
  status: StatusResult | "checking" | "pending";
}) {
  const icon =
    status === "checking"
      ? colors.cyan("[~]")
      : status === "pending"
        ? colors.dim("[ ]")
        : status.ok
          ? colors.neonGreen("[-]")
          : colors.magenta("[!]");

  const timing =
    status === "checking"
      ? colors.cyan("checking...")
      : status === "pending"
        ? colors.dim("--")
        : status.ok
          ? colors.neonGreen(`${status.ms}ms`)
          : colors.magenta(`${status.ms}ms`);

  return (
    <Box>
      <Text>
        {"  "}
        {icon} {name.padEnd(12)} {timing.padEnd(14)} {colors.dim(url)}
      </Text>
    </Box>
  );
}

function StatusView({ endpoints, env, onComplete }: StatusViewProps) {
  const [results, setResults] = useState<
    Record<string, StatusResult | "checking" | "pending">
  >(() => {
    const initial: Record<string, "pending"> = {};
    for (const ep of endpoints) {
      initial[ep.name] = "pending";
    }
    return initial;
  });

  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function runChecks() {
      for (const ep of endpoints) {
        if (!mounted) return;
        setResults((prev) => ({ ...prev, [ep.name]: "checking" }));

        const result = await checkHealth(ep.url);

        if (!mounted) return;
        setResults((prev) => ({ ...prev, [ep.name]: result }));
      }
      setDone(true);
      onComplete?.();
    }

    runChecks();

    return () => {
      mounted = false;
    };
  }, [endpoints, onComplete]);

  const healthy = Object.values(results).filter(
    (r) => typeof r === "object" && r.ok
  ).length;
  const total = endpoints.length;
  const checking = Object.values(results).filter(
    (r) => r === "checking"
  ).length;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text>
          {colors.cyan(`+${"-".repeat(46)}+`)}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text>
          {"  "}
          {icons.scan} {gradients.cyber(`SCANNING ${env} endpoints`)}
        </Text>
      </Box>
      <Box marginBottom={1}>
        <Text>{colors.cyan(`+${"-".repeat(46)}+`)}</Text>
      </Box>

      {endpoints.map((ep) => (
        <StatusRow
          key={ep.name}
          name={ep.name}
          url={ep.url}
          status={results[ep.name]}
        />
      ))}

      <Box marginTop={1}>
        <Text>{colors.dim(divider(48))}</Text>
      </Box>
      <Box>
        <Text>
          {"  "}
          {done
            ? colors.neonGreen(`${healthy}/${total} healthy`)
            : colors.cyan(`${checking} checking...`)}
        </Text>
      </Box>
    </Box>
  );
}

export function renderStatusView(
  endpoints: Endpoint[],
  env: string
): Promise<void> {
  return new Promise((resolve) => {
    const { unmount } = render(
      <StatusView
        endpoints={endpoints}
        env={env}
        onComplete={() => {
          setTimeout(() => {
            unmount();
            resolve();
          }, 100);
        }}
      />
    );
  });
}
