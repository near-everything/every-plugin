import type { Compiler, RspackPluginInstance } from '@rspack/core';
import { rspack } from '@rspack/core';
import path from 'node:path';
import { getPluginInfo } from './utils';
import { loadDevConfig } from './utils';
import { buildSharedDependencies } from './module-federation';
import { setupPluginMiddleware } from './dev-server-middleware';


export interface EveryPluginOptions {
  devConfigPath?: string;  // defaults to './plugin.dev.ts'
  port?: number;           // override plugin.dev.ts port
  pluginId?: string;       // override auto-detected
}

export class EveryPluginDevServer implements RspackPluginInstance {
  name = 'EveryPluginDevServer';

  constructor(private options: EveryPluginOptions = {}) {}

  apply(compiler: Compiler) {
    // Load configuration
    const pluginInfo = getPluginInfo(compiler.options.context || process.cwd());
    const devConfig = loadDevConfig(this.options.devConfigPath || './plugin.dev.ts');
    const port = this.options.port || devConfig?.port || 3999;

    // Configure defaults immediately (no hooks needed)
    this.configureDefaults(compiler, pluginInfo);

    // Initialize devServer if it doesn't exist
    if (!compiler.options.devServer) {
      compiler.options.devServer = {};
    }

    // Configure dev server
    this.configureDevServer(compiler, pluginInfo, devConfig, port);

    // Apply Module Federation plugin
    new rspack.container.ModuleFederationPlugin({
      name: pluginInfo.normalizedName,
      filename: 'remoteEntry.js',
      runtimePlugins: [
        require.resolve('@module-federation/node/runtimePlugin'),
      ],
      library: { type: 'commonjs-module' },
      exposes: {
        './plugin': './src/index.ts',
      },
      shared: buildSharedDependencies(pluginInfo),
    }).apply(compiler);
  }

  private configureDefaults(compiler: Compiler, pluginInfo: any) {
    const context = compiler.options.context || process.cwd();

    // Configure output defaults
    if (!compiler.options.output) {
      compiler.options.output = {};
    }
    compiler.options.output.uniqueName = pluginInfo.normalizedName;
    compiler.options.output.publicPath = 'auto';
    compiler.options.output.path = path.resolve(context, 'dist');
    compiler.options.output.clean = true;
    compiler.options.output.library = { type: 'commonjs-module' };

    // Configure entry if not set
    if (!compiler.options.entry) {
      compiler.options.entry = {
        main: {
          import: ['./src/index']
        }
      };
    }

    // Configure target and mode defaults
    if (!compiler.options.target) {
      compiler.options.target = 'async-node';
    }

    if (!compiler.options.mode) {
      compiler.options.mode = process.env.NODE_ENV === 'development' ? 'development' : 'production';
    }

    // Configure devtool
    if (!compiler.options.devtool) {
      compiler.options.devtool = 'source-map';
    }

    // Suppress verbose infrastructure logging
    if (!compiler.options.infrastructureLogging) {
      compiler.options.infrastructureLogging = {
        level: 'warn',  // Only show warnings and errors
      };
    }

    // Configure module rules - ensure TypeScript loader is present
    this.ensureTypeScriptLoader(compiler);

    // Configure resolve extensions
    if (!compiler.options.resolve) {
      compiler.options.resolve = {};
    }
    compiler.options.resolve.extensions = ['...', '.tsx', '.ts'];
  }

  private ensureTypeScriptLoader(compiler: Compiler) {
    if (!compiler.options.module) {
      compiler.options.module = { rules: [] } as any;
    }

    if (!compiler.options.module.rules) {
      compiler.options.module.rules = [];
    }

    // Check if TypeScript loader is already configured
    const hasTsLoader = compiler.options.module.rules.some((rule: any) =>
      typeof rule === 'object' &&
      rule !== null &&
      'test' in rule &&
      rule.test instanceof RegExp &&
      rule.test.test('.ts')
    );

    // Add TypeScript loader if not present
    if (!hasTsLoader) {
      compiler.options.module.rules.push({
        test: /\.tsx?$/,
        use: 'builtin:swc-loader',
        exclude: /node_modules/,
      });
    }
  }

  private configureDevServer(compiler: Compiler, pluginInfo: any, devConfig: any, port: number) {
    if (!compiler.options.devServer) {
      return; // Should never happen due to check in apply()
    }

    const context = compiler.options.context || process.cwd();
    const originalSetup = compiler.options.devServer.setupMiddlewares;

    compiler.options.devServer.port = port;
    compiler.options.devServer.static = path.join(context, 'dist');
    compiler.options.devServer.hot = true;
    compiler.options.devServer.devMiddleware = { writeToDisk: true };
    compiler.options.devServer.headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
    };

    // Suppress verbose logging
    compiler.options.devServer.client = {
      logging: 'warn',  // Only show warnings and errors
      overlay: {
        warnings: false,  // Don't show warning overlay
        errors: true,     // Still show errors
      },
    };

    compiler.options.devServer.setupMiddlewares = (middlewares, devServer) => {
      setupPluginMiddleware(devServer, pluginInfo, devConfig, port);
      return originalSetup ? originalSetup(middlewares, devServer) : middlewares;
    };
  }
}
