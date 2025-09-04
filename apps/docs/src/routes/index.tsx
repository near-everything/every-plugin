import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <div className="container mx-auto px-4 py-16">
        {/* Hero Section */}
        <div className="text-center max-w-4xl mx-auto mb-16">
          <h1 className="text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            every plugin
          </h1>
          <p className="text-xl text-muted-foreground mb-8 leading-relaxed">
            A composable, type-safe plugin runtime using Effect and Module Federation. 
            Build scalable plugin systems with automatic resource management, remote loading, and full TypeScript safety.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              to="/docs/$"
              params={{ _splat: '' }}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Get Started
            </Link>
            <Link
              to="/docs/$"
              params={{ _splat: 'examples' }}
              className="px-6 py-3 border border-border rounded-lg font-medium hover:bg-accent transition-colors"
            >
              View Examples
            </Link>
          </div>
        </div>

        {/* Quick Example */}
        <div className="max-w-4xl mx-auto mb-16">
          <h2 className="text-2xl font-semibold mb-6 text-center">Quick Example</h2>
          <div className="bg-card border rounded-lg p-6 overflow-x-auto">
            <pre className="text-sm">
              <code>{`import { Effect } from "effect";
import { createPluginRuntime, PluginRuntime } from "every-plugin/runtime";

const runtime = createPluginRuntime({
  registry: {
    "data-processor": {
      remoteUrl: "https://cdn.example.com/plugins/processor/remoteEntry.js",
      type: "transformer",
      version: "1.0.0"
    }
  },
  secrets: { API_KEY: "secret-value" }
});

const result = await runtime.runPromise(
  Effect.gen(function* () {
    const pluginRuntime = yield* PluginRuntime;
    
    const plugin = yield* pluginRuntime.usePlugin("data-processor", {
      secrets: { apiKey: "{{API_KEY}}" },
      variables: { batchSize: 100 }
    });
    
    return yield* pluginRuntime.executePlugin(plugin, {
      items: ["data1", "data2", "data3"]
    });
  })
);`}</code>
            </pre>
          </div>
        </div>

        {/* Features Grid */}
        <div className="max-w-6xl mx-auto mb-16">
          <h2 className="text-3xl font-semibold mb-12 text-center">Why every-plugin?</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="text-center p-6">
              <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mx-auto mb-4">
                {/* <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Lightning bolt">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg> */}
              </div>
              <h3 className="text-lg font-semibold mb-2">Effect Composition</h3>
              <p className="text-muted-foreground">
                Chain plugin operations with automatic error handling and resource cleanup using Effect's powerful composition patterns.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mx-auto mb-4">
                {/* <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Download cloud">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg> */}
              </div>
              <h3 className="text-lg font-semibold mb-2">Remote Loading</h3>
              <p className="text-muted-foreground">
                Load plugins dynamically from CDN URLs without bundling using Module Federation for true runtime flexibility.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-12 h-12 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mx-auto mb-4">
                {/* <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg> */}
              </div>
              <h3 className="text-lg font-semibold mb-2">Type Safety</h3>
              <p className="text-muted-foreground">
                oRPC contracts ensure compile-time safety between runtime and plugins with full TypeScript integration.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center mx-auto mb-4">
                {/* <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg> */}
              </div>
              <h3 className="text-lg font-semibold mb-2">State Management</h3>
              <p className="text-muted-foreground">
                Resumable operations with Zod-validated state schemas for streaming and long-running processes.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center mx-auto mb-4">
                {/* <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg> */}
              </div>
              <h3 className="text-lg font-semibold mb-2">Error Recovery</h3>
              <p className="text-muted-foreground">
                Built-in error types and recovery patterns with automatic retry logic and graceful degradation.
              </p>
            </div>

            <div className="text-center p-6">
              <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900 rounded-lg flex items-center justify-center mx-auto mb-4">
                {/* <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg> */}
              </div>
              <h3 className="text-lg font-semibold mb-2">Streaming Support</h3>
              <p className="text-muted-foreground">
                Built-in streaming capabilities for continuous data processing with Effect Streams integration.
              </p>
            </div>
          </div>
        </div>

        {/* Architecture Overview */}
        <div className="max-w-4xl mx-auto mb-16 text-center">
          <h2 className="text-3xl font-semibold mb-6">Architecture Overview</h2>
          <p className="text-muted-foreground mb-8">
            every-plugin combines proven technologies to create a robust, scalable plugin system
          </p>
          <div className="bg-card border rounded-lg p-8">
            <div className="grid md:grid-cols-4 gap-6 items-center">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <span className="text-blue-600 dark:text-blue-400 font-bold text-lg">E</span>
                </div>
                <h4 className="font-semibold">Effect</h4>
                <p className="text-sm text-muted-foreground">Async composition</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <span className="text-purple-600 dark:text-purple-400 font-bold text-lg">MF</span>
                </div>
                <h4 className="font-semibold">Module Federation</h4>
                <p className="text-sm text-muted-foreground">Remote loading</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <span className="text-green-600 dark:text-green-400 font-bold text-lg">oRPC</span>
                </div>
                <h4 className="font-semibold">oRPC</h4>
                <p className="text-sm text-muted-foreground">Type-safe contracts</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900 rounded-lg flex items-center justify-center mx-auto mb-3">
                  <span className="text-orange-600 dark:text-orange-400 font-bold text-lg">Z</span>
                </div>
                <h4 className="font-semibold">Zod</h4>
                <p className="text-sm text-muted-foreground">Runtime validation</p>
              </div>
            </div>
          </div>
        </div>

        {/* Getting Started CTA */}
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-semibold mb-4">Ready to get started?</h2>
          <p className="text-muted-foreground mb-6">
            Explore our comprehensive documentation to learn how to build scalable plugin systems with every-plugin.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              to="/docs/$"
              params={{ _splat: 'core' }}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Core Concepts
            </Link>
            <Link
              to="/docs/$"
              params={{ _splat: 'runtime' }}
              className="px-6 py-3 border border-border rounded-lg font-medium hover:bg-accent transition-colors"
            >
              Runtime Guide
            </Link>
            <Link
              to="/docs/$"
              params={{ _splat: 'plugins' }}
              className="px-6 py-3 border border-border rounded-lg font-medium hover:bg-accent transition-colors"
            >
              Create Plugins
            </Link>
          </div>
        </div>
      </div>
    </HomeLayout>
  );
}
