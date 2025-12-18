import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeFederation } from './federation';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

const pathname = window.location.pathname;

// Initialize federation before rendering
initializeFederation().then(async () => {
  const ComponentModule = pathname === '/components'
    ? await import('./components')
    : await import('./main');

  const RootComponent = ComponentModule.default;

  createRoot(rootElement!).render(
    <StrictMode>
      <RootComponent />
    </StrictMode>
  );
}).catch((error) => {
  console.error('Failed to initialize federation:', error);
  document.body.innerHTML = '<div style="color: red; padding: 20px;">Failed to initialize application. Check console for details.</div>';
});
