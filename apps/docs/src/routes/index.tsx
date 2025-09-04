import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      {/* Hero Section with Gradient Background */}
      <div className="relative min-h-screen flex flex-col items-start justify-center overflow-hidden bg-black">
        {/* Animated Gradient Background */}
        <div className="absolute inset-0 opacity-60">
          <div 
            className="absolute inset-0 bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600"
            style={{ filter: 'blur(120px)' }}
          />
          <div 
            className="absolute top-1/4 left-1/3 w-96 h-96 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full opacity-40"
            style={{ filter: 'blur(80px)' }}
          />
          <div 
            className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full opacity-30"
            style={{ filter: 'blur(100px)' }}
          />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-8 py-20">
          <div className="max-w-4xl">
            {/* Main Heading - Large, Off-centered, Left-aligned */}
            <h1 className="text-8xl md:text-9xl lg:text-[12rem] font-bold text-white mb-8 leading-[0.85] tracking-tight gt-standard">
              every<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
                plugin
              </span>
            </h1>
            
            {/* Subtitle */}
            <p className="text-2xl md:text-3xl text-gray-300 mb-12 max-w-2xl leading-relaxed gt-standard">
              a composable plugin runtime
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 mb-16">
              <Link
                to="/docs/$"
                params={{ _splat: '' }}
                className="px-8 py-4 bg-white text-black rounded-xl font-medium hover:bg-gray-200 transition-all duration-200 shadow-lg hover:shadow-xl text-lg gt-standard-mono"
              >
                Get Started
              </Link>
              <Link
                to="/docs/$"
                params={{ _splat: 'examples' }}
                className="px-8 py-4 bg-black/50 backdrop-blur-sm text-white border border-white/20 rounded-xl font-medium hover:bg-black/70 transition-all duration-200 shadow-lg hover:shadow-xl text-lg gt-standard-mono"
              >
                View Examples
              </Link>
            </div>
          </div>
        </div>

        {/* Floating Feature Cards */}
        <div className="relative z-10 max-w-7xl mx-auto px-8 pb-20">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl">
            {/* Effect Composition Card */}
            <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-2xl p-6 shadow-2xl hover:bg-black/50 transition-all duration-300">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center mb-4">
                <span className="text-white font-bold text-lg">E</span>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3 gt-standard">Effect Composition</h3>
              <p className="text-gray-400 leading-relaxed">
                Chain plugin operations with automatic error handling and resource cleanup.
              </p>
            </div>

            {/* Remote Loading Card */}
            <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-2xl p-6 shadow-2xl hover:bg-black/50 transition-all duration-300">
              <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-4">
                <span className="text-white font-bold text-lg">MF</span>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3 gt-standard">Remote Loading</h3>
              <p className="text-gray-400 leading-relaxed">
                Load plugins dynamically from CDN URLs using Module Federation.
              </p>
            </div>

            {/* Type Safety Card */}
            <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-2xl p-6 shadow-2xl hover:bg-black/50 transition-all duration-300 md:col-span-2 lg:col-span-1">
              <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl flex items-center justify-center mb-4">
                <span className="text-white font-bold text-lg">TS</span>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3 gt-standard">Type Safety</h3>
              <p className="text-gray-400 leading-relaxed">
                Full TypeScript integration with oRPC contracts for compile-time safety.
              </p>
            </div>
          </div>
        </div>
      </div>
    </HomeLayout>
  );
}
