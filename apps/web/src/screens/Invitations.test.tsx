import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setCsrfToken } from '../api/client';
import type { Role, User } from '../api/types';
import { AuthProvider } from '../auth/session';

/** Super admins (créent les groupes), invitations d'admins et page du lien d'invitation. */

const user = (role: Role): User => ({
  id: 'u-me',
  username: 'chef',
  platoUsername: 'chef_plato',
  role,
});

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
      const key = `${init.method ?? 'GET'} ${new URL(url).pathname}`;
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

const loggedInAs = (role: Role, groups: unknown[] = []) => {
  handlers['GET /auth/me'] = () => ({ body: { user: user(role), csrfToken: 'csrf-1' } });
  handlers['GET /groups'] = () => ({ body: groups });
};

describe('le propriétaire valide les super admins', () => {
  it('crée un lien, l’affiche une seule fois, puis ne montre que son existence', async () => {
    loggedInAs('PLATFORM_OWNER');
    let pending: unknown[] = [];
    handlers['GET /creator-invitations'] = () => ({ body: pending });
    handlers['POST /creator-invitations'] = () => {
      pending = [
        { id: 'i1', createdAt: '2026-11-23T10:00:00Z', expiresAt: '2099-01-01T00:00:00Z' },
      ];
      return {
        status: 201,
        body: {
          id: 'i1',
          groupId: null,
          groupRole: null,
          expiresAt: '2099-01-01T00:00:00Z',
          url: 'https://i-am-in.test/invitation/jeton-secret',
        },
      };
    };
    const u = renderApp('/super-admins');
    await u.click(await screen.findByRole('button', { name: 'Créer un lien d’invitation' }));
    expect(await screen.findByText('https://i-am-in.test/invitation/jeton-secret')).toBeTruthy();
    expect(await screen.findByText(/En attente · 1/)).toBeTruthy();
  });

  it('refuse l’écran à un compte qui n’est pas le propriétaire', async () => {
    loggedInAs('GROUP_CREATOR');
    handlers['GET /groups'] = () => ({ body: [] });
    renderApp('/super-admins');
    expect(await screen.findByText(/crée ton premier groupe/)).toBeTruthy();
    expect(calls.some((c) => c.key.includes('creator-invitations'))).toBe(false);
  });

  it('le propriétaire est dirigé vers les super admins quand il n’y a aucun groupe', async () => {
    loggedInAs('PLATFORM_OWNER');
    renderApp('/');
    expect(await screen.findByText(/Invite un super admin depuis l’onglet Moi/)).toBeTruthy();
  });
});

describe('un super admin crée ses groupes', () => {
  it('propose de créer le premier groupe, puis envoie le nom', async () => {
    loggedInAs('GROUP_CREATOR');
    handlers['POST /groups'] = () => ({
      status: 201,
      body: { group: { id: 'g9', name: 'Les Cracks' } },
    });
    const u = renderApp('/');
    await u.click(await screen.findByRole('link', { name: 'Créer un groupe' }));
    await u.type(await screen.findByLabelText('Nom du groupe'), '  Les Cracks ');
    handlers['GET /groups'] = () => ({
      body: [{ id: 'g9', name: 'Les Cracks', myRole: 'SUPER_ADMIN', memberCount: 1 }],
    });
    handlers['GET /groups/g9'] = () => ({
      body: {
        id: 'g9',
        name: 'Les Cracks',
        myRole: 'SUPER_ADMIN',
        members: [{ userId: 'u-me', username: 'chef', platoUsername: 'c', role: 'SUPER_ADMIN' }],
      },
    });
    handlers['GET /invitations'] = () => ({ body: [] });
    handlers['GET /groups/g9/invitations'] = () => ({ body: [] });
    await u.click(screen.getByRole('button', { name: 'Créer le groupe' }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /groups')?.body).toEqual({ name: 'Les Cracks' }),
    );
    // Il atterrit sur son groupe, où il invite ses admins.
    expect(await screen.findByRole('button', { name: 'Créer un lien d’invitation' })).toBeTruthy();
  });

  it('un simple admin ne voit ni la création de groupe ni les invitations', async () => {
    loggedInAs('MEMBER', [{ id: 'g1', name: 'G', myRole: 'ADMIN', memberCount: 2 }]);
    handlers['GET /groups/g1'] = () => ({
      body: { id: 'g1', name: 'G', myRole: 'ADMIN', members: [] },
    });
    renderApp('/groupe');
    expect(await screen.findByRole('heading', { name: 'Groupe' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Créer un groupe' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Créer un lien d’invitation' })).toBeNull();
    // Un compte non super admin n'atteint pas l'écran de création.
    expect(calls.some((c) => c.key === 'POST /groups')).toBe(false);
  });
});

describe('la page du lien d’invitation', () => {
  it('crée un compte avec le jeton du lien', async () => {
    handlers['GET /auth/me'] = () => ({ status: 401 });
    handlers['POST /invitations/accept'] = () => ({
      status: 201,
      body: { user: user('GROUP_CREATOR'), csrfToken: 'csrf-2' },
    });
    handlers['GET /groups'] = () => ({ body: [] });
    const u = renderApp('/invitation/le-jeton-du-lien');
    await u.type(await screen.findByLabelText('Identifiant'), 'chef');
    await u.type(screen.getByLabelText('Pseudo Plato'), 'chef_plato');
    await u.type(screen.getByLabelText('Mot de passe'), 'un-mot-de-passe-de-test');
    await u.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    expect(await screen.findByText(/crée ton premier groupe/)).toBeTruthy();
    expect(calls.find((c) => c.key === 'POST /invitations/accept')?.body).toEqual({
      token: 'le-jeton-du-lien',
      username: 'chef',
      password: 'un-mot-de-passe-de-test',
      platoUsername: 'chef_plato',
    });
  });

  it('affiche l’erreur de l’API pour un lien expiré', async () => {
    handlers['GET /auth/me'] = () => ({ status: 401 });
    handlers['POST /invitations/accept'] = () => ({
      status: 400,
      body: { message: 'Invitation invalide ou expirée' },
    });
    const u = renderApp('/invitation/perime');
    await u.type(await screen.findByLabelText('Identifiant'), 'chef');
    await u.type(screen.getByLabelText('Pseudo Plato'), 'chef_plato');
    await u.type(screen.getByLabelText('Mot de passe'), 'un-mot-de-passe-de-test');
    await u.click(screen.getByRole('button', { name: 'Créer mon compte' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Invitation invalide ou expirée',
    );
  });

  it('connecté, utilise l’invitation avec le compte actuel (join)', async () => {
    loggedInAs('MEMBER', [{ id: 'g1', name: 'G', myRole: 'ADMIN', memberCount: 2 }]);
    handlers['POST /invitations/join'] = () => ({ body: { groupId: null } });
    handlers['GET /groups/g1/tournaments'] = () => ({ body: [] });
    const u = renderApp('/invitation/jeton');
    await u.click(await screen.findByRole('button', { name: 'Utiliser l’invitation' }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /invitations/join')?.body).toEqual({
        token: 'jeton',
      }),
    );
  });
});
