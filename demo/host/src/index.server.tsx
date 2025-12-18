import { renderToString } from 'react-dom/server';
import { StrictMode } from 'react';
import Main from './main';
import Components from './components';

const getRouteComponent = (pathname: string) => {
  switch (pathname) {
    case '/components':
      return Components;
    default:
      return Main;
  }
};

export function render(pathname: string): string {
  const Component = getRouteComponent(pathname);

  return renderToString(
    <StrictMode>
      <Component />
    </StrictMode>
  );
}

export { Main, Components };
