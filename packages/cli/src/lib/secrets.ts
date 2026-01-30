import { loadConfig } from "../config";

export function loadSecretsFor(component: string): Record<string, string> {
  const config = loadConfig();
  if (!config) return {};
  const componentConfig = config.app[component];
  if (!componentConfig) return {};

  const secretNames = ("secrets" in componentConfig ? componentConfig.secrets : undefined) ?? [];
  if (secretNames.length === 0) return {};

  const secrets: Record<string, string> = {};
  for (const name of secretNames) {
    const value = process.env[name];
    if (value) secrets[name] = value;
  }

  return secrets;
}

export function loadAllSecrets(): {
  host: Record<string, string>;
  api: Record<string, string>;
} {
  return {
    host: loadSecretsFor("host"),
    api: loadSecretsFor("api"),
  };
}
