import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { Toaster } from 'sonner';
import './index.css';

try {
  const rootElement = document.getElementById('root');
  
  if (!rootElement) {
    throw new Error('Root element #root not found in DOM');
  }

  const root = createRoot(rootElement);

  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
        <Toaster position="top-right" richColors />
      </ErrorBoundary>
    </StrictMode>
  );
} catch (error) {
  console.error('main.tsx: CRITICAL ERROR during initialization:', error);
  const rootElement = document.getElementById('root');
  if (rootElement) {
    rootElement.innerHTML = `<div style="padding: 20px; color: red; font-family: sans-serif;">
      <h1>Erreur Critique au Démarrage</h1>
      <pre>${error instanceof Error ? error.stack : String(error)}</pre>
    </div>`;
  }
}
