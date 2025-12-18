import { useEffect } from 'react';
import { Outlet, createRootRouteWithContext, useMatches } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import { TanStackDevtools } from '@tanstack/react-devtools';

import TanStackQueryDevtools from '../integrations/tanstack-query/devtools';

import type { QueryClient } from '@tanstack/react-query';

interface MyRouterContext {
  queryClient: QueryClient;
}

const routeTitles: Record<string, string> = {
  '/': 'Home',
  '/social': 'Social',
  '/graph': 'Graph',
};

function TitleSync() {
  const matches = useMatches();
  const currentPath = matches[matches.length - 1]?.pathname || '/';

  useEffect(() => {
    const title = routeTitles[currentPath] || 'App';
    window.dispatchEvent(
      new CustomEvent('near:title-change', {
        detail: { title },
      })
    );
  }, [currentPath]);

  return null;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => (
    <>
      <TitleSync />
      <Outlet />
      <TanStackDevtools
        config={{
          position: 'bottom-right',
        }}
        plugins={[
          {
            name: 'Tanstack Router',
            render: <TanStackRouterDevtoolsPanel />,
          },
          TanStackQueryDevtools,
        ]}
      />
    </>
  ),
});
