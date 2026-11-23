import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, describeError, setCsrfToken } from './client';

function mockFetch(status: number, body?: unknown) {
  const fn = vi.fn(() =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setCsrfToken(undefined);
});

describe('describeError', () => {
  it('lit le message de l’API', () => {
    expect(describeError(409, { message: 'Le tirage est déjà fait' }).message).toBe(
      'Le tirage est déjà fait',
    );
  });

  it('remonte le premier message de champ et les garde par champ', () => {
    const e = describeError(400, {
      message: 'Données invalides',
      errors: [{ field: 'name', message: '2 caractères au minimum' }],
    });
    expect(e.message).toBe('2 caractères au minimum');
    expect(e.fields).toEqual({ name: '2 caractères au minimum' });
  });

  it('retombe sur un texte par défaut sans message', () => {
    expect(describeError(429, undefined).message).toContain('Trop de tentatives');
    expect(describeError(500, 'oups').message).toBe('Le serveur a répondu par une erreur.');
  });
});

describe('api', () => {
  it('envoie le cookie de session et le jeton CSRF sur une écriture', async () => {
    const fn = mockFetch(200, { ok: true });
    setCsrfToken('csrf-123');
    await api('POST', '/groups/g/tournaments', { name: 'x' });
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/groups\/g\/tournaments$/);
    expect(init.credentials).toBe('include');
    expect(init.headers).toMatchObject({ 'x-csrf-token': 'csrf-123' });
    expect(init.body).toBe(JSON.stringify({ name: 'x' }));
  });

  it('n’envoie pas le jeton CSRF sur une lecture', async () => {
    const fn = mockFetch(200, []);
    setCsrfToken('csrf-123');
    await api('GET', '/groups');
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).not.toHaveProperty('x-csrf-token');
  });

  it('accepte une réponse vide (204)', async () => {
    mockFetch(204);
    await expect(api('DELETE', '/x')).resolves.toBeUndefined();
  });

  it('lève une ApiError avec le statut', async () => {
    mockFetch(403, { message: 'Un autre admin tient la main sur ce tournoi' });
    const error = await api('PATCH', '/x', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(403);
    expect((error as ApiError).message).toBe('Un autre admin tient la main sur ce tournoi');
  });

  it('explique un serveur injoignable', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('failed')));
    const error = await api('GET', '/x').catch((e: unknown) => e);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).message).toContain('injoignable');
  });
});
