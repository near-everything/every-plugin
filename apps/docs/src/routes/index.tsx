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
      </div>
    </HomeLayout>
  );
}
