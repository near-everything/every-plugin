import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './bootstrap';
import reportWebVitals from './reportWebVitals';

const rootElement = document.getElementById('app');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

reportWebVitals();
