import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { Toaster } from 'sonner';
import './index.css';

console.log('main.tsx: Script execution started');

try {
  const rootElement = document.getElementById('root');
  console.log('main.tsx: Root element found:', !!rootElement);
  
  if (!rootElement) {
    throw new Error('Root element #root not found in DOM');
  }

  const root = createRoot(rootElement);
  console.log('main.tsx: React root created. Rendering App...');

  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
        <Toaster position="top-center" richColors />
      </ErrorBoundary>
    </StrictMode>,
  );
  console.log('main.tsx: Render call finished');
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
