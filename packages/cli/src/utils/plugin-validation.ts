import { resolve, join } from "path";
import { existsSync, readFileSync } from "fs";

export interface ValidationResult {
  success: boolean;
  message: string;
  details?: string;
}

export interface PluginValidationResults {
  overall: boolean;
  results: {
    directoryExists: ValidationResult;
    packageJsonExists: ValidationResult;
    packageJsonValid: ValidationResult;
    hasEveryPluginPeerDep: ValidationResult;
    hasRequiredFiles: ValidationResult;
  };
  pluginInfo?: {
    name: string;
    version: string;
    description: string;
    author?: string;
    repository?: string;
    keywords?: string[];
    peerDependencies?: Record<string, string>;
  };
}

export async function validatePlugin(
  pluginPath: string,
  options: { cwd?: string; verbose?: boolean } = {}
): Promise<PluginValidationResults> {
  const targetDir = resolve(options.cwd || process.cwd(), pluginPath);
  
  const results: PluginValidationResults = {
    overall: false,
    results: {
      directoryExists: { success: false, message: "" },
      packageJsonExists: { success: false, message: "" },
      packageJsonValid: { success: false, message: "" },
      hasEveryPluginPeerDep: { success: false, message: "" },
      hasRequiredFiles: { success: false, message: "" }
    }
  };

  // Check if plugin directory exists
  if (!existsSync(targetDir)) {
    results.results.directoryExists = {
      success: false,
      message: `Plugin directory "${pluginPath}" not found`,
      details: `Looked for: ${targetDir}`
    };
    return results;
  }
  results.results.directoryExists = {
    success: true,
    message: "Plugin directory exists"
  };

  // Check if package.json exists
  const packageJsonPath = join(targetDir, "package.json");
  if (!existsSync(packageJsonPath)) {
    results.results.packageJsonExists = {
      success: false,
      message: "No package.json found in plugin directory",
      details: `Expected: ${packageJsonPath}`
    };
    return results;
  }
  results.results.packageJsonExists = {
    success: true,
    message: "package.json exists"
  };

  // Try to read and parse package.json
  let pluginPackage: any;
  try {
    pluginPackage = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    results.results.packageJsonValid = {
      success: true,
      message: "package.json is valid JSON"
    };
    
    // Store plugin info
    results.pluginInfo = {
      name: pluginPackage.name,
      version: pluginPackage.version,
      description: pluginPackage.description || "",
      author: pluginPackage.author,
      repository: pluginPackage.repository?.url || pluginPackage.repository,
      keywords: pluginPackage.keywords || [],
      peerDependencies: pluginPackage.peerDependencies
    };
  } catch (error) {
    results.results.packageJsonValid = {
      success: false,
      message: "Failed to parse package.json",
      details: error instanceof Error ? error.message : String(error)
    };
    return results;
  }

  // Check for every-plugin peer dependency
  if (!pluginPackage.peerDependencies?.["every-plugin"]) {
    results.results.hasEveryPluginPeerDep = {
      success: false,
      message: "Plugin must have 'every-plugin' as a peer dependency",
      details: "Add 'every-plugin': '^0.1.0' to peerDependencies in package.json"
    };
  } else {
    results.results.hasEveryPluginPeerDep = {
      success: true,
      message: `Has every-plugin peer dependency: ${pluginPackage.peerDependencies["every-plugin"]}`
    };
  }

  // Check for required files
  const requiredFiles = ["src/index.ts", "rspack.config.cjs"];
  const missingFiles = requiredFiles.filter(file => !existsSync(join(targetDir, file)));
  
  if (missingFiles.length > 0) {
    results.results.hasRequiredFiles = {
      success: false,
      message: `Missing required files: ${missingFiles.join(", ")}`,
      details: `Required files: ${requiredFiles.join(", ")}`
    };
  } else {
    results.results.hasRequiredFiles = {
      success: true,
      message: "All required files present"
    };
  }

  // Determine overall success
  results.overall = Object.values(results.results).every(result => result.success);

  return results;
}

export function formatValidationResults(
  results: PluginValidationResults,
  options: { verbose?: boolean } = {}
): string {
  const lines: string[] = [];
  
  if (results.pluginInfo) {
    lines.push("Plugin Information:");
    lines.push(`  Name: ${results.pluginInfo.name}`);
    lines.push(`  Version: ${results.pluginInfo.version}`);
    lines.push(`  Description: ${results.pluginInfo.description || "No description"}`);
    if (options.verbose && results.pluginInfo.author) {
      lines.push(`  Author: ${results.pluginInfo.author}`);
    }
    lines.push("");
  }

  lines.push("Validation Results:");
  
  for (const [key, result] of Object.entries(results.results)) {
    const status = result.success ? "✅" : "❌";
    lines.push(`  ${status} ${result.message}`);
    
    if (options.verbose && result.details) {
      lines.push(`     ${result.details}`);
    }
  }

  lines.push("");
  lines.push(`Overall: ${results.overall ? "✅ Valid" : "❌ Invalid"}`);

  return lines.join("\n");
}
