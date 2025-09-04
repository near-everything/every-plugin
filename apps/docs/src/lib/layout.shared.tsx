import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { BookIcon, CodeIcon, GithubIcon, RocketIcon } from 'lucide-react';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
              every
            </span>
            <span className="text-white">plugin</span>
          </span>
        </div>
      ),
      transparentMode: 'always',
    },
    links: [
      {
        text: 'Documentation',
        url: '/docs',
        icon: <BookIcon className="w-4 h-4" />,
        active: 'nested-url',
      },
      {
        text: 'Examples',
        url: '/docs/examples',
        icon: <CodeIcon className="w-4 h-4" />,
        active: 'nested-url',
      },
      {
        text: 'Runtime',
        url: '/docs/runtime',
        icon: <RocketIcon className="w-4 h-4" />,
        active: 'nested-url',
      },
      {
        type: 'icon',
        text: 'Github',
        label: 'GitHub Repository',
        icon: <GithubIcon className="w-5 h-5" />,
        url: 'https://github.com/near-everything/run',
        secondary: true,
      },
    ],
    githubUrl: 'https://github.com/near-everything/run',
  };
}
