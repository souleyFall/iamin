import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setCsrfToken } from '../api/client';
import type { Overview, OverviewTournamentPage } from '../api/types';
import { AuthProvider } from '../auth/session';
import { I18nProvider } from '../lib/i18n';

/** Tableau de bord du propriétaire : chiffres, filtres, groupes, personnes ; rien à modifier. */

let calls: { method: string; path: string }[];
let role: 'PLATFORM_OWNER' | 'GROUP_CREATOR';

const summary: Overview = {
  generatedAt: '2026-11-27T12:00:00Z',
  accounts: { total: 3, superAdmins: 1, admins: 1 },
  active: { online: 1, week: 2, month: 3 },
  tournaments: { total: 4, REGISTRATION: 1, CHECK_IN: 0, STARTED: 2, FINISHED: 1 },
  registrations: { total: 20, accepted: 15, waitlist: 3, pending: 2, players: 12 },
  groups: [
    {
      id: 'g1',
      name: 'Les Stratèges',
      createdAt: '2026-11-01T10:00:00Z',
      superAdmins: [{ id: 'u1', username: 'boss' }],
      admins: [],
      tournaments: { total: 4, running: 2, finished: 1 },
      registrations: 20,
      lastTournamentAt: '2026-11-20T10:00:00Z',
    },
  ],
  people: [
    {
      id: 'u1',
      username: 'boss',
      platoUsername: 'BossPlato',
      kind: 'SUPER_ADMIN',
      createdAt: '2026-11-01T10:00:00Z',
      lastActiveAt: '2026-11-27T11:55:00Z',
      groups: [{ id: 'g1', name: 'Les Stratèges', role: 'SUPER_ADMIN' }],
    },
    {
      id: 'u2',
      username: 'adam',
      platoUsername: 'AdamPlato',
      kind: 'ADMIN',
      createdAt: '2026-11-02T10:00:00Z',
      lastActiveAt: null,
      groups: [{ id: 'g1', name: 'Les Stratèges', role: 'ADMIN' }],
    },
  ],
};

const page: OverviewTournamentPage = {
  total: 1,
  nextBefore: null,
  tournaments: [
    {
      id: 't1',
      name: 'Coupe du soir',
      format: 'ELIMINATION',
      status: 'FINISHED',
      capacity: 8,
      createdAt: '2026-11-20T10:00:00Z',
      drawnAt: null,
      group: { id: 'g1', name: 'Les Stratèges' },
      holder: 'boss',
      counts: { accepted: 8, waitlist: 2, pending: 0 },
    },
  ],
};

beforeEach(() => {
  calls = [];
  role = 'PLATFORM_OWNER';
  localStorage.clear();
  localStorage.setItem('iamin-lang', 'fr');
  setCsrfToken(undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      const target = new URL(url);
      const method = init.method ?? 'GET';
      calls.push({ method, path: `${target.pathname}${target.search}` });
      const bodies: Record<string, unknown> = {
        '/auth/me': {
          user: { id: 'o', username: 'chef', platoUsername: 'c', role, mfaEnabled: true },
          csrfToken: 'c',
        },
        '/groups': [],
        '/overview': summary,
        '/overview/tournaments': page,
      };
      const body = bodies[target.pathname];
      return Promise.resolve(
        new Response(JSON.stringify(body ?? { message: 'non géré' }), {
          status: body === undefined ? 404 : 200,
        }),
      );
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

describe('tableau de bord du propriétaire', () => {
  it('montre les chiffres clés et les tournois avec leur état', async () => {
    renderAt('/apercu');
    expect(await screen.findByText('Joueurs différents : 12')).toBeTruthy();
    expect(screen.getByText('En ligne : 1 · Sur 30 jours : 3')).toBeTruthy();
    expect(screen.getByText('Validés : 15 · Liste d’attente : 3 · À valider : 2')).toBeTruthy();
    expect(await screen.findByText('Coupe du soir')).toBeTruthy();
    expect(screen.getByText('8/8 places · 2 en liste d’attente')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Terminés 1' })).toBeTruthy();
  });

  it('filtre par état, groupe, format et nom : la demande part au serveur', async () => {
    const user = renderAt('/apercu');
    await screen.findByText('Coupe du soir');
    await user.click(screen.getByRole('button', { name: 'En cours 2' }));
    await user.selectOptions(screen.getByLabelText('Groupe'), 'g1');
    await user.selectOptions(screen.getByLabelText('Format'), 'LEAGUE');
    await user.type(screen.getByLabelText('Chercher un tournoi'), 'coupe');
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.path === '/overview/tournaments?status=STARTED&groupId=g1&format=LEAGUE&q=coupe',
        ),
      ).toBe(true),
    );
  });

  it('liste les groupes et les personnes avec leur dernière activité', async () => {
    const user = renderAt('/apercu');
    await user.click(await screen.findByRole('button', { name: 'Groupes' }));
    expect(
      screen.getByText('Tournois : 4 · En cours : 2 · Terminés : 1 · Inscriptions : 20'),
    ).toBeTruthy();
    expect(screen.getByText('aucun', { exact: false })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Personnes' }));
    expect(screen.getByText('En ligne')).toBeTruthy();
    expect(screen.getByText('Aucune activité depuis 30 jours')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Admin 1' }));
    expect(screen.getByText('adam')).toBeTruthy();
    expect(screen.queryByText('En ligne')).toBeNull();
  });

  it('ne propose aucune action : que des filtres, et jamais une requête qui écrit', async () => {
    const user = renderAt('/apercu');
    await screen.findByText('Coupe du soir');
    for (const tab of ['Groupes', 'Personnes', 'Tournois']) {
      await user.click(screen.getByRole('button', { name: tab }));
      expect(
        screen.queryByRole('button', { name: /Supprimer|Modifier|Inviter|Retirer|Créer/ }),
      ).toBeNull();
    }
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    // Pas de lien vers un tournoi : le propriétaire n'y a pas accès.
    expect(
      screen.queryAllByRole('link').filter((a) => a.getAttribute('href')?.startsWith('/tournois/')),
    ).toEqual([]);
  });

  it('un autre rôle est renvoyé à l’accueil, sans aucun appel à la vue d’ensemble', async () => {
    role = 'GROUP_CREATOR';
    renderAt('/apercu');
    await screen.findByRole('link', { name: /Tournois/ });
    expect(screen.queryByText('Tableau de bord')).toBeNull();
    expect(calls.some((c) => c.path.startsWith('/overview'))).toBe(false);
  });
});
