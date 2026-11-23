import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';

import './index.css';

function registerOfflineWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const configuredBase = document.querySelector('base')?.href ?? import.meta.env.BASE_URL;
  const baseUrl = new URL(configuredBase, window.location.href);
  void navigator.serviceWorker
    .register(new URL('sw.js', baseUrl), { scope: baseUrl.pathname })
    .catch((error: unknown) => {
      console.error('Offline app setup failed:', error);
    });
}

if (document.readyState === 'complete') {
  registerOfflineWorker();
} else {
  window.addEventListener('load', registerOfflineWorker, { once: true });
}

createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
