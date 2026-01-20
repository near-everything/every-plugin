import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getConfigDir, loadConfig } from "../config";

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    
    result[key] = value;
  }
  
  return result;
}

export function loadSecretsFor(component: string): Record<string, string> {
  const config = loadConfig();
  const configDir = getConfigDir();
  
  const componentConfig = config.app[component];
  if (!componentConfig) {
    return {};
  }
  
  const secretNames = ("secrets" in componentConfig ? componentConfig.secrets : undefined) ?? [];
  if (secretNames.length === 0) {
    return {};
  }
  
  let fileEnvVars: Record<string, string> = {};
  const envPath = resolve(configDir, component, ".env");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    fileEnvVars = parseEnvFile(envContent);
  }
  
  const secrets: Record<string, string> = {};
  for (const name of secretNames) {
    if (fileEnvVars[name]) {
      secrets[name] = fileEnvVars[name];
    } else if (process.env[name]) {
      secrets[name] = process.env[name]!;
    }
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
