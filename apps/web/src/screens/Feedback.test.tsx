import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setCsrfToken } from '../api/client';
import type { FeedbackItem, Role } from '../api/types';
import { AuthProvider } from '../auth/session';

/** Retours des utilisateurs : formulaire ouvert à tous, boîte de réception du propriétaire. */

type Handler = (body: unknown) => { status?: number; body?: unknown };
let handlers: Record<string, Handler>;
let calls: { key: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  handlers = {};
  setCsrfToken(undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      const u = new URL(url);
      const key = `${init.method ?? 'GET'} ${u.pathname}${u.search}`;
      const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      calls.push({ key, body });
      const handler = handlers[key];
      if (!handler) {
        return Promise.resolve(
          new Response(JSON.stringify({ message: `non géré : ${key}` }), { status: 404 }),
        );
      }
      const out = handler(body);
      return Promise.resolve(
        new Response(out.body === undefined ? null : JSON.stringify(out.body), {
          status: out.status ?? 200,
        }),
      );
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderApp(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const asRole = (role: Role) => {
  handlers['GET /auth/me'] = () => ({
    body: {
      user: {
        id: 'u1',
        username: 'alice',
        platoUsername: 'alice',
        role,
        mfaEnabled: role === 'PLATFORM_OWNER',
      },
      csrfToken: 'c',
      // Le propriétaire vient de se connecter avec son code : les actions sensibles sont permises.
      elevatedUntil: new Date(Date.now() + 600_000).toISOString(),
    },
  });
  handlers['GET /groups'] = () => ({ body: [] });
};

describe('donner son avis', () => {
  it('un joueur sans compte écrit anonymement, avec un pseudo facultatif', async () => {
    handlers['GET /auth/me'] = () => ({ status: 401 });
    handlers['POST /public/feedback'] = () => ({ status: 201, body: { id: 'f1' } });
    const u = renderApp('/avis');
    await u.click(await screen.findByRole('button', { name: 'Bug' }));
    await u.type(screen.getByLabelText('Ton message'), 'Le classement ne se met pas à jour.');
    await u.type(screen.getByLabelText('Ton pseudo Plato (facultatif)'), 'Karim_77');
    await u.click(screen.getByRole('button', { name: 'Envoyer' }));
    expect(await screen.findByRole('heading', { name: 'Merci !' })).toBeTruthy();
    expect(calls.find((c) => c.key === 'POST /public/feedback')?.body).toEqual({
      kind: 'BUG',
      message: 'Le classement ne se met pas à jour.',
      contact: 'Karim_77',
    });
  });

  it('sans pseudo, aucun champ « contact » n’est envoyé', async () => {
    handlers['GET /auth/me'] = () => ({ status: 401 });
    handlers['POST /public/feedback'] = () => ({ status: 201, body: { id: 'f1' } });
    const u = renderApp('/avis');
    await u.type(await screen.findByLabelText('Ton message'), 'Une idée de fonctionnalité.');
    await u.click(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByRole('heading', { name: 'Merci !' });
    expect(calls.find((c) => c.key === 'POST /public/feedback')?.body).toEqual({
      kind: 'IDEA',
      message: 'Une idée de fonctionnalité.',
    });
  });

  it('un admin connecté écrit avec son compte : pas de pseudo demandé, route des comptes', async () => {
    asRole('MEMBER');
    handlers['POST /feedback'] = () => ({ status: 201, body: { id: 'f1' } });
    const u = renderApp('/avis');
    await u.type(await screen.findByLabelText('Ton message'), 'Pouvoir trier les inscrits.');
    expect(screen.queryByLabelText('Ton pseudo Plato (facultatif)')).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Envoyer' }));
    await screen.findByRole('heading', { name: 'Merci !' });
    expect(calls.some((c) => c.key === 'POST /public/feedback')).toBe(false);
    expect(calls.find((c) => c.key === 'POST /feedback')?.body).toEqual({
      kind: 'IDEA',
      message: 'Pouvoir trier les inscrits.',
    });
  });

  it('n’envoie pas un message trop court et affiche l’erreur de l’API sinon', async () => {
    handlers['GET /auth/me'] = () => ({ status: 401 });
    handlers['POST /public/feedback'] = () => ({
      status: 503,
      body: { message: 'La boîte de retours est pleine pour le moment, réessaie plus tard.' },
    });
    const u = renderApp('/avis');
    const send = await screen.findByRole<HTMLButtonElement>('button', { name: 'Envoyer' });
    await u.type(screen.getByLabelText('Ton message'), 'abc');
    expect(send.disabled).toBe(true);
    await u.type(screen.getByLabelText('Ton message'), 'defgh');
    await u.click(send);
    expect((await screen.findByRole('alert')).textContent).toContain('boîte de retours est pleine');
  });
});

describe('boîte de réception du propriétaire', () => {
  const item = (over: Partial<FeedbackItem> = {}): FeedbackItem => ({
    id: 'f1',
    kind: 'BUG',
    message: '<img src=x onerror=alert(1)> Le tirage plante\nsur mobile.',
    contact: 'Karim_77',
    author: null,
    status: 'NEW',
    createdAt: '2026-11-23T10:00:00Z',
    handledAt: null,
    ...over,
  });

  it('affiche le message comme du texte, avec son auteur, et classe un retour', async () => {
    asRole('PLATFORM_OWNER');
    handlers['GET /feedback?status=NEW'] = () => ({
      body: [item(), item({ id: 'f2', author: { username: 'sana' }, contact: null, kind: 'IDEA' })],
    });
    handlers['PATCH /feedback/f1'] = () => ({ status: 204 });
    const u = renderApp('/retours');
    const first = (await screen.findAllByRole('listitem'))[0];
    if (!first) throw new Error('aucun retour affiché');
    // Le HTML saisi par un inconnu reste du texte : aucune balise n'est créée.
    expect(first.querySelector('img')).toBeNull();
    expect(first.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(first.textContent).toContain('Joueur · Karim_77');
    expect(screen.getByText(/Admin sana/)).toBeTruthy();

    await u.click(within(first).getByRole('button', { name: 'Marquer comme traité' }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'PATCH /feedback/f1')?.body).toEqual({ status: 'DONE' }),
    );
  });

  it('demande confirmation avant de supprimer', async () => {
    asRole('PLATFORM_OWNER');
    handlers['GET /feedback?status=NEW'] = () => ({ body: [item()] });
    handlers['DELETE /feedback/f1'] = () => ({ status: 204 });
    const u = renderApp('/retours');
    await u.click(await screen.findByRole('button', { name: 'Supprimer' }));
    expect(calls.some((c) => c.key === 'DELETE /feedback/f1')).toBe(false);
    await u.click(screen.getByRole('button', { name: 'Supprimer pour de bon' }));
    await waitFor(() => expect(calls.some((c) => c.key === 'DELETE /feedback/f1')).toBe(true));
  });

  it('un autre compte n’atteint pas la boîte et ne la demande pas à l’API', async () => {
    asRole('GROUP_CREATOR');
    renderApp('/retours');
    expect(await screen.findByText(/crée ton premier groupe/)).toBeTruthy();
    expect(calls.some((c) => c.key.includes('/feedback'))).toBe(false);
  });
});
