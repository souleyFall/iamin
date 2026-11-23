import { API_URL, ApiError } from '../api/client';

/**
 * Envoie au journal du serveur une erreur survenue dans le navigateur (écran cassé, promesse
 * rejetée) : sans cela, un plantage chez un joueur ne laisse aucune trace chez nous.
 *
 * Confidentialité : un message et une trace, la page SANS paramètres ni ancre (un lien personnel de
 * joueur s'y trouverait). Pas de données de formulaire. Les erreurs de l'API ne sont pas renvoyées :
 * le serveur les a déjà écrites. Au plus 5 envois par chargement de page, sans répétition.
 */
export type ClientErrorKind = 'error' | 'unhandledrejection' | 'render';

const MAX_REPORTS = 5;
const sent = new Set<string>();

export function reportError(kind: ClientErrorKind, error: unknown): void {
  if (error instanceof ApiError || sent.size >= MAX_REPORTS) return;
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
  if (sent.has(message)) return;
  sent.add(message);
  const stack = error instanceof Error ? error.stack?.slice(0, 1500) : undefined;
  const page = window.location.pathname.slice(0, 200);
  // Pas de `api()` : un échec d'envoi ne doit jamais provoquer une nouvelle erreur.
  void fetch(`${API_URL}/public/client-errors`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    keepalive: true,
    body: JSON.stringify({ kind, message, stack, page }),
  }).catch(() => undefined);
}

/** À appeler une fois au démarrage : attrape ce que React ne voit pas (événements, promesses). */
export function installErrorReporting(): void {
  window.addEventListener('error', (event) => reportError('error', event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) =>
    reportError('unhandledrejection', event.reason),
  );
}
