/**
 * Client de l'API. Authentification : cookie de session (httpOnly, posé par l'API, jamais lisible
 * par le JavaScript) + jeton CSRF renvoyé à la connexion, gardé EN MÉMOIRE seulement : ni
 * localStorage ni cookie lisible, donc rien à voler après coup. Au rechargement de la page,
 * `/auth/me` le renvoie tant que la session est valide.
 */
export const API_URL: string = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000'
).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let csrfToken: string | undefined;

export function setCsrfToken(token: string | undefined): void {
  csrfToken = token;
}

const FALLBACK: Record<number, string> = {
  400: 'Données invalides.',
  401: 'Connexion requise.',
  403: 'Action non autorisée.',
  404: 'Introuvable.',
  409: 'Action impossible dans l’état actuel.',
  429: 'Trop de tentatives, réessaie dans une minute.',
};

/** Extrait un message lisible d'une réponse d'erreur de l'API. */
export function describeError(status: number, body: unknown): ApiError {
  const fields: Record<string, string> = {};
  let message = FALLBACK[status] ?? 'Le serveur a répondu par une erreur.';
  if (typeof body === 'object' && body !== null) {
    const { message: m, errors } = body as { message?: unknown; errors?: unknown };
    if (typeof m === 'string' && m !== '') message = m;
    if (Array.isArray(errors)) {
      for (const e of errors) {
        const { field, message: text } = e as { field?: unknown; message?: unknown };
        if (typeof field === 'string' && typeof text === 'string') fields[field] = text;
      }
      const first = Object.values(fields)[0];
      if (first !== undefined) message = first;
    }
  }
  return new ApiError(status, message, fields);
}

export async function api<T>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (csrfToken !== undefined && method !== 'GET') headers['x-csrf-token'] = csrfToken;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Serveur injoignable. Vérifie ta connexion.');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text === '' ? undefined : JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  if (!res.ok) throw describeError(res.status, parsed);
  return parsed as T;
}
