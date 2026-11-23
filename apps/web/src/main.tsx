import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource-variable/doto';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AuthProvider } from './auth/session';
import { applyTheme, initialTheme } from './lib/theme';
import './styles/tokens.css';
import './styles/app.css';

applyTheme(initialTheme());

const client = new QueryClient({
  defaultOptions: {
    queries: {
      // Pas de nouvelle tentative sur une erreur « normale » (401, 403, 404, 409) : l'écran l'explique.
      retry: false,
      refetchOnWindowFocus: true,
    },
  },
});

// Le service worker n'est actif qu'en production : en développement il masquerait les changements.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sans service worker l'application marche pareil, seulement sans installation ni hors ligne.
    });
  });
}

const root = document.getElementById('root');
if (!root) throw new Error('Élément #root introuvable');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
