import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { setCsrfToken } from './api/client';
import type { Tournament, TournamentSummary, User } from './api/types';
import { AuthProvider } from './auth/session';

const me: User = {
  id: 'u-me',
  username: 'alice',
  platoUsername: 'alice_plato',
  role: 'MEMBER',
  mfaEnabled: false,
};
const GROUP = { id: 'g1', name: 'Les Stratèges', myRole: 'ADMIN', memberCount: 2 };

const summary = (over: Partial<TournamentSummary> = {}): TournamentSummary => ({
  id: 't1',
  name: 'Échecs #12',
  format: 'ELIMINATION',
  capacity: 16,
  status: 'REGISTRATION',
  publicSlug: 'x'.repeat(22),
  forfeitScore: 1,
  allowDraws: false,
  language: 'fr',
  createdAt: '2026-11-22T10:00:00Z',
  startsAt: null,
  drawnAt: null,
  drawSeed: null,
  holder: { id: 'u-me', username: 'alice' },
  handoverTo: null,
  counts: { pending: 1, accepted: 1, waitlist: 0 },
  ...over,
});

const detail = (over: Partial<Tournament> = {}): Tournament => {
  const rest: Omit<TournamentSummary, 'counts'> = summary();
  return {
    ...rest,
    registrations: [
      {
        id: 'r1',
        platoName: 'Karim_77',
        status: 'PENDING',
        presence: 'UNKNOWN',
        createdAt: '2026-11-22T10:01:00Z',
      },
      {
        id: 'r2',
        platoName: 'Sana.fx',
        status: 'ACCEPTED',
        presence: 'UNKNOWN',
        createdAt: '2026-11-22T10:02:00Z',
      },
    ],
    ...over,
  };
};

type Handler = (body: unknown) => { status?: number; body?: unknown };
let handlers: Record<string, Handler>;
let calls: { key: string; headers: Record<string, string>; body: unknown }[];

function json(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

beforeEach(() => {
  calls = [];
  handlers = {};
  setCsrfToken(undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      const path = new URL(url).pathname;
      const key = `${init.method ?? 'GET'} ${path}`;
      const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      calls.push({ key, headers: (init.headers ?? {}) as Record<string, string>, body });
      const handler = handlers[key];
      if (!handler) return Promise.resolve(json(404, { message: `non géré : ${key}` }));
      const out = handler(body);
      return Promise.resolve(json(out.status ?? 200, out.body));
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

const loggedIn = () => {
  handlers['GET /auth/me'] = () => ({ body: { user: me, csrfToken: 'csrf-1' } });
  handlers['GET /groups'] = () => ({ body: [GROUP] });
};

describe('connexion', () => {
  it('renvoie vers la connexion sans session', async () => {
    handlers['GET /auth/me'] = () => ({ status: 401, body: { message: 'Connexion requise' } });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Connexion admin' })).toBeTruthy();
  });

  it('connecte, puis affiche les tournois du groupe', async () => {
    handlers['GET /auth/me'] = () => ({ status: 401 });
    handlers['POST /auth/login'] = () => ({ body: { user: me, csrfToken: 'csrf-1' } });
    handlers['GET /groups'] = () => ({ body: [GROUP] });
    handlers['GET /groups/g1/tournaments'] = () => ({ body: [summary()] });
    const user = renderApp('/');
    await user.type(await screen.findByLabelText('Identifiant'), 'alice');
    await user.type(screen.getByLabelText('Mot de passe'), 'un-mot-de-passe-de-test');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('Échecs #12')).toBeTruthy();
    expect(screen.getByText('Tu as la main')).toBeTruthy();
    expect(calls.find((c) => c.key === 'POST /auth/login')?.body).toEqual({
      username: 'alice',
      password: 'un-mot-de-passe-de-test',
    });
  });

  it('affiche l’erreur de l’API sans distinguer le compte du mot de passe', async () => {
    handlers['GET /auth/me'] = () => ({ status: 401 });
    handlers['POST /auth/login'] = () => ({
      status: 401,
      body: { message: 'Identifiants incorrects' },
    });
    const user = renderApp('/connexion');
    await user.type(await screen.findByLabelText('Identifiant'), 'alice');
    await user.type(screen.getByLabelText('Mot de passe'), 'faux-faux-faux');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Identifiants incorrects');
  });
});

describe('liste des tournois', () => {
  it('propose d’accepter un relais', async () => {
    loggedIn();
    handlers['GET /groups/g1/tournaments'] = () => ({
      body: [
        summary({
          id: 't9',
          name: 'Dames #4',
          holder: { id: 'u-sana', username: 'Sana' },
          handoverTo: { id: 'u-me', username: 'alice' },
        }),
      ],
    });
    handlers['POST /groups/g1/tournaments/t9/relay/accept'] = () => ({ body: {} });
    const user = renderApp('/');
    const banner = await screen.findByRole('region', { name: 'Relais proposé sur Dames #4' });
    expect(banner.textContent).toContain('Sana te passe la main sur Dames #4');
    await user.click(within(banner).getByRole('button', { name: 'Accepter' }));
    await waitFor(() =>
      expect(calls.some((c) => c.key === 'POST /groups/g1/tournaments/t9/relay/accept')).toBe(true),
    );
    // Le jeton CSRF accompagne l'écriture.
    const write = calls.find((c) => c.key === 'POST /groups/g1/tournaments/t9/relay/accept');
    expect(write?.headers['x-csrf-token']).toBe('csrf-1');
  });

  it('explique au propriétaire de la plateforme qu’il n’a pas accès aux tournois', async () => {
    handlers['GET /auth/me'] = () => ({
      body: { user: { ...me, role: 'PLATFORM_OWNER', mfaEnabled: true }, csrfToken: 'c' },
    });
    handlers['GET /groups'] = () => ({ body: [{ ...GROUP, myRole: null }] });
    renderApp('/');
    expect(await screen.findByText(/n’accède pas aux tournois des groupes/)).toBeTruthy();
    expect(calls.some((c) => c.key.includes('/tournaments'))).toBe(false);
  });

  it('dit quoi faire quand il n’y a aucun tournoi', async () => {
    loggedIn();
    handlers['GET /groups/g1/tournaments'] = () => ({ body: [] });
    renderApp('/');
    expect(await screen.findByText(/Aucun tournoi pour l’instant/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Nouveau tournoi' })).toBeTruthy();
  });
});

describe('un tournoi : la main', () => {
  function tournamentPage(t: Tournament) {
    loggedIn();
    handlers['GET /groups/g1'] = () => ({
      body: {
        ...GROUP,
        members: [
          { userId: 'u-me', username: 'alice', platoUsername: 'a', role: 'ADMIN' },
          { userId: 'u-sana', username: 'Sana', platoUsername: 's', role: 'SUPER_ADMIN' },
        ],
      },
    });
    handlers['GET /groups/g1/tournaments/t1'] = () => ({ body: t });
    handlers['POST /groups/g1/tournaments/t1/registrations/r1/accept'] = () => ({ body: {} });
  }

  it('permet d’écrire quand on tient la main', async () => {
    tournamentPage(detail());
    const user = renderApp('/tournois/t1/inscrits');
    expect(await screen.findByText('TU AS LA MAIN')).toBeTruthy();
    const validate = screen.getByRole('button', { name: 'Valider Karim_77' });
    expect((validate as HTMLButtonElement).disabled).toBe(false);
    await user.click(validate);
    await waitFor(() =>
      expect(
        calls.some((c) => c.key === 'POST /groups/g1/tournaments/t1/registrations/r1/accept'),
      ).toBe(true),
    );
  });

  it('passe en lecture seule quand un autre admin tient la main', async () => {
    tournamentPage(detail({ holder: { id: 'u-sana', username: 'Sana' } }));
    renderApp('/tournois/t1/inscrits');
    expect(await screen.findByText('MAIN : Sana')).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Valider Karim_77' }).disabled,
    ).toBe(true);
    expect(screen.getByText(/seul l’admin qui tient la main peut modifier/)).toBeTruthy();
    // Un admin simple ne peut pas reprendre la main.
    expect(screen.queryByRole('button', { name: 'Reprendre la main' })).toBeNull();
  });

  it('laisse un super admin reprendre la main', async () => {
    tournamentPage(detail({ holder: { id: 'u-sana', username: 'Sana' } }));
    handlers['GET /groups/g1'] = () => ({
      body: { ...GROUP, myRole: 'SUPER_ADMIN', members: [] },
    });
    renderApp('/tournois/t1/inscrits');
    expect(await screen.findByRole('button', { name: 'Reprendre la main' })).toBeTruthy();
  });

  it('fige la liste des joueurs après le tirage', async () => {
    tournamentPage(detail({ status: 'STARTED', drawnAt: '2026-11-22T11:00:00Z', drawSeed: 'abc' }));
    handlers['GET /groups/g1/tournaments/t1/draw'] = () => ({ status: 404 });
    renderApp('/tournois/t1/inscrits');
    expect(await screen.findByText(/liste des joueurs est figée/)).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Valider Karim_77' }).disabled,
    ).toBe(true);
  });
});
