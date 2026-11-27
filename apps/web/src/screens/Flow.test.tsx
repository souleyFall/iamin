import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setCsrfToken } from '../api/client';
import type { BracketView, LeagueView, Tournament } from '../api/types';
import { AuthProvider } from '../auth/session';
import { I18nProvider } from '../lib/i18n';

/**
 * Le déroulé d'un tournoi : on désigne le vainqueur (élimination) ou on saisit le score (ligue), le
 * tour suivant s'ouvre tout seul quand un tour est fini, le tirage mène aux matchs, les matchs nuls
 * dépendent du choix fait à la création.
 */

type Handler = (body: unknown) => { status?: number; body?: unknown };
let handlers: Record<string, Handler>;
let calls: { key: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  handlers = {};
  localStorage.clear();
  // Langue de l'écran fixée : sans elle, la langue du navigateur de test (anglais) s'appliquerait.
  localStorage.setItem('iamin-lang', 'fr');
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
          new Response(JSON.stringify({ message: 'non géré' }), { status: 404 }),
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

const me = {
  user: { id: 'u1', username: 'alice', platoUsername: 'a', role: 'MEMBER', mfaEnabled: false },
  csrfToken: 'c',
};
const group = { id: 'g1', name: 'Les Stratèges', myRole: 'ADMIN', memberCount: 2 };
function signedIn() {
  handlers['GET /auth/me'] = () => ({ body: me });
  handlers['GET /groups'] = () => ({ body: [group] });
  handlers['GET /groups/g1'] = () => ({ body: { ...group, members: [] } });
}

const NAMES = { r1: 'naruto', r2: 'sasuke', r3: 'kakashi', r4: 'itachi' };
const reg = (id: keyof typeof NAMES, presence: 'PRESENT' | 'UNKNOWN' = 'PRESENT') => ({
  id,
  platoName: NAMES[id],
  status: 'ACCEPTED' as const,
  presence,
  createdAt: '',
});

const tournament = (over: Partial<Tournament> = {}): Tournament => ({
  id: 't1',
  name: 'Coupe',
  format: 'ELIMINATION',
  capacity: 4,
  status: 'STARTED',
  publicSlug: 's'.repeat(22),
  forfeitScore: 1,
  allowDraws: false,
  language: 'fr',
  startsAt: null,
  createdAt: '2026-11-24T10:00:00Z',
  drawnAt: '2026-11-24T10:05:00Z',
  drawSeed: 'seed',
  holder: { id: 'u1', username: 'alice' },
  handoverTo: null,
  registrations: [reg('r1'), reg('r2'), reg('r3'), reg('r4')],
  ...over,
});

/** Tableau à 4 joueurs : deux demi-finales puis la finale ; `won` = qui a gagné chaque match. */
function bracket(won: Partial<Record<'R1M1' | 'R1M2' | 'R2M1', 'a' | 'b'>>): BracketView {
  const first = (code: 'R1M1' | 'R1M2', a: string, b: string) => {
    const w = won[code];
    return {
      id: code,
      round: 1,
      index: code === 'R1M1' ? 1 : 2,
      a,
      b,
      aBye: false,
      bBye: false,
      winner: w ? (w === 'a' ? a : b) : null,
      status: w ? ('done' as const) : ('ready' as const),
      score: w ? (w === 'a' ? { a: 1, b: 0 } : { a: 0, b: 1 }) : null,
    };
  };
  const m1 = first('R1M1', 'r1', 'r2');
  const m2 = first('R1M2', 'r3', 'r4');
  const ready = m1.winner !== null && m2.winner !== null;
  const wf = won.R2M1;
  const final = {
    id: 'R2M1',
    round: 2,
    index: 1,
    a: m1.winner,
    b: m2.winner,
    aBye: false,
    bBye: false,
    winner: ready && wf ? (wf === 'a' ? m1.winner : m2.winner) : null,
    status: !ready ? ('waiting' as const) : wf ? ('done' as const) : ('ready' as const),
    score: ready && wf ? (wf === 'a' ? { a: 1, b: 0 } : { a: 0, b: 1 }) : null,
  };
  return {
    format: 'ELIMINATION',
    status: final.winner ? 'FINISHED' : 'STARTED',
    seed: 'seed',
    drawnAt: '2026-11-24T10:05:00Z',
    initialPlayers: ['r1', 'r2', 'r3', 'r4'],
    forfeitScore: 1,
    allowDraws: false,
    players: Object.entries(NAMES).map(([id, platoName]) => ({
      id,
      platoName,
      status: 'ACCEPTED' as const,
    })),
    versions: {},
    forfeits: {},
    bracket: { size: 4, byes: 0, rounds: [[m1, m2], [final]] },
    champion: final.winner,
  };
}

describe('élimination directe : le vainqueur, sans score', () => {
  it('un clic désigne le vainqueur, puis la finale s’ouvre toute seule avec une annonce', async () => {
    signedIn();
    const won: Parameters<typeof bracket>[0] = { R1M1: 'a' };
    handlers['GET /groups/g1/tournaments/t1'] = () => ({ body: tournament() });
    handlers['GET /groups/g1/tournaments/t1/draw'] = () => ({ body: bracket(won) });
    handlers['PUT /groups/g1/tournaments/t1/matches/R1M2/result'] = (body) => {
      won.R1M2 = (body as { winner: 'a' | 'b' }).winner;
      return { body: bracket(won) };
    };
    const user = renderAt('/tournois/t1/jeu');

    // Un match ne se saisit pas avec un score : on désigne le vainqueur.
    await user.click(
      await screen.findByRole('button', { name: 'Désigner le vainqueur du match 2' }),
    );
    expect(screen.queryByRole('button', { name: 'Enregistrer le score' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'kakashi gagne' }));

    await waitFor(() =>
      expect(calls.find((c) => c.key.endsWith('/matches/R1M2/result'))?.body).toEqual({
        winner: 'a',
        version: 0,
      }),
    );
    // Tour terminé : la finale s'affiche seule, et une phrase l'annonce.
    expect(
      await screen.findByText('Demi-finales : tous les matchs sont joués. Suite : Finale.'),
    ).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(
      tabs.find((t) => t.textContent?.startsWith('Finale'))?.getAttribute('aria-selected'),
    ).toBe('true');
    expect(
      await screen.findByRole('button', { name: 'Désigner le vainqueur du match 1' }),
    ).toBeTruthy();
  });

  it('affiche le gagnant par une coche, jamais un score', async () => {
    signedIn();
    handlers['GET /groups/g1/tournaments/t1'] = () => ({ body: tournament() });
    handlers['GET /groups/g1/tournaments/t1/draw'] = () => ({ body: bracket({ R1M1: 'b' }) });
    renderAt('/tournois/t1/jeu');
    await screen.findByRole('button', { name: 'Désigner le vainqueur du match 1' });
    expect(screen.getAllByLabelText('Vainqueur')).toHaveLength(1);
    expect(screen.queryByText('1')).toBeNull();
    expect(screen.queryByText('–')).toBeNull();
  });

  it('le tournoi terminé propose de copier les résultats', async () => {
    signedIn();
    handlers['GET /groups/g1/tournaments/t1'] = () => ({
      body: tournament({ status: 'FINISHED' }),
    });
    handlers['GET /groups/g1/tournaments/t1/draw'] = () => ({
      body: bracket({ R1M1: 'a', R1M2: 'a', R2M1: 'a' }),
    });
    renderAt('/tournois/t1/jeu');
    expect(await screen.findByText('Tournoi terminé')).toBeTruthy();
    expect(screen.getByText('Vainqueur du tournoi : naruto')).toBeTruthy();
    const copy = screen.getByRole('link', { name: 'Copier les résultats' });
    expect(copy.getAttribute('href')).toContain('copier');
  });
});

function league(allowDraws: boolean): LeagueView {
  return {
    format: 'LEAGUE',
    status: 'STARTED',
    seed: 'seed',
    drawnAt: '2026-11-24T10:05:00Z',
    initialPlayers: ['r1', 'r2'],
    forfeitScore: 1,
    allowDraws,
    players: [
      { id: 'r1', platoName: 'naruto', status: 'ACCEPTED' },
      { id: 'r2', platoName: 'sasuke', status: 'ACCEPTED' },
    ],
    versions: {},
    forfeits: {},
    schedule: {
      legs: 1,
      rests: [null],
      rounds: [[{ id: 'R1M1', round: 1, index: 1, a: 'r1', b: 'r2' }]],
    },
    scores: {},
    standings: { rows: [], played: 0, total: 1, complete: false },
  };
}

describe('ligue : le score, et le nul selon le choix du tournoi', () => {
  async function openMatch(allowDraws: boolean) {
    signedIn();
    handlers['GET /groups/g1/tournaments/t1'] = () => ({
      body: tournament({
        format: 'LEAGUE',
        allowDraws,
        registrations: [reg('r1'), reg('r2')],
      }),
    });
    handlers['GET /groups/g1/tournaments/t1/draw'] = () => ({ body: league(allowDraws) });
    handlers['PUT /groups/g1/tournaments/t1/matches/R1M1/result'] = () => ({
      body: league(allowDraws),
    });
    const user = renderAt('/tournois/t1/jeu');
    await user.click(await screen.findByRole('button', { name: 'Saisir le score du match 1' }));
    return user;
  }

  it('refuse l’égalité quand le tournoi n’autorise pas les nuls', async () => {
    await openMatch(false);
    expect(screen.getByText('Un match ne peut pas finir à égalité.')).toBeTruthy();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Enregistrer le score' }).disabled,
    ).toBe(true);
  });

  it('accepte l’égalité quand le tournoi autorise les nuls', async () => {
    const user = await openMatch(true);
    expect(screen.getByText('Match nul : 1 point chacun.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Enregistrer le score' }));
    await waitFor(() =>
      expect(calls.find((c) => c.key.endsWith('/matches/R1M1/result'))?.body).toEqual({
        a: 0,
        b: 0,
        version: 0,
      }),
    );
  });
});

describe('tirage : les matchs s’ouvrent sans clic de plus', () => {
  it('après le tirage, on arrive directement sur les matchs du premier tour', async () => {
    signedIn();
    let drawn = false;
    const checkIn = () =>
      tournament({
        status: drawn ? 'STARTED' : 'CHECK_IN',
        drawnAt: drawn ? '2026-11-24T10:05:00Z' : null,
        drawSeed: drawn ? 'seed' : null,
        registrations: [reg('r1'), reg('r2')],
      });
    const view = bracket({});
    const duel = {
      ...view,
      initialPlayers: ['r1', 'r2'],
      bracket: { size: 2, byes: 0, rounds: [[view.bracket.rounds[0]![0]!]] },
    };
    handlers['GET /groups/g1/tournaments/t1'] = () => ({ body: checkIn() });
    handlers['GET /groups/g1/tournaments/t1/draw'] = () => ({ body: duel });
    handlers['POST /groups/g1/tournaments/t1/draw'] = () => {
      drawn = true;
      return { status: 201, body: duel };
    };
    const user = renderAt('/tournois/t1/tirage');
    await user.click(await screen.findByRole('button', { name: 'Faire le tirage' }));
    expect(
      await screen.findByRole('button', { name: 'Désigner le vainqueur du match 1' }),
    ).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Finale/ })).toBeTruthy();
  });

  it('un tirage déjà fait renvoie vers les matchs, la graine reste repliée', async () => {
    signedIn();
    handlers['GET /groups/g1/tournaments/t1'] = () => ({ body: tournament() });
    handlers['GET /groups/g1/tournaments/t1/draw'] = () => ({ body: bracket({}) });
    renderAt('/tournois/t1/tirage');
    const link = await screen.findByRole('link', { name: 'Voir les matchs' });
    expect(link.getAttribute('href')).toContain('jeu');
    const details = screen.getByText('Détails du tirage').closest('details');
    expect(details?.open).toBe(false);
  });
});

describe('création : le créateur choisit si les matchs nuls existent', () => {
  async function fill(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText('Nom du tournoi'), 'Ma ligue');
    fireEvent.change(screen.getByLabelText('Date et heure du tournoi'), {
      target: { value: '2026-12-05T20:30' },
    });
  }
  const created = () => calls.find((c) => c.key === 'POST /groups/g1/tournaments')?.body;

  beforeEach(() => {
    signedIn();
    handlers['POST /groups/g1/tournaments'] = () => ({ status: 201, body: tournament() });
    handlers['GET /groups/g1/tournaments'] = () => ({ body: [] });
    handlers['GET /groups/g1/tournaments/t1'] = () => ({ body: tournament() });
  });

  it('en ligue : non par défaut, et oui si le jeu le permet', async () => {
    const user = renderAt('/nouveau');
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Ligue' }));
    expect(
      screen.getByText('Chaque match a un gagnant : un score à égalité sera refusé.'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Autorisés' }));
    expect(
      screen.getByText('Le jeu permet l’égalité : un nul rapporte 1 point à chacun.'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Créer le tournoi' }));
    await waitFor(() => expect(created()).toMatchObject({ format: 'LEAGUE', allowDraws: true }));
  });

  it('demande la date et l’heure : sans elles on ne crée pas, et elles partent en UTC', async () => {
    const user = renderAt('/nouveau');
    await user.type(await screen.findByLabelText('Nom du tournoi'), 'Ma coupe');
    const submit = screen.getByRole<HTMLButtonElement>('button', { name: 'Créer le tournoi' });
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Date et heure du tournoi'), {
      target: { value: '2026-12-05T20:30' },
    });
    expect(submit.disabled).toBe(false);
    await user.click(submit);
    // La saisie est à l'heure de l'appareil ; le serveur reçoit le même instant en UTC.
    await waitFor(() =>
      expect(created()).toMatchObject({ startsAt: new Date('2026-12-05T20:30').toISOString() }),
    );
  });

  it('en ligue, sans toucher au choix : les nuls sont refusés', async () => {
    const user = renderAt('/nouveau');
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Ligue' }));
    await user.click(screen.getByRole('button', { name: 'Créer le tournoi' }));
    await waitFor(() => expect(created()).toMatchObject({ format: 'LEAGUE', allowDraws: false }));
  });

  it('en élimination : pas de choix, on désigne le vainqueur, jamais de nul', async () => {
    const user = renderAt('/nouveau');
    await fill(user);
    expect(screen.queryByRole('button', { name: 'Autorisés' })).toBeNull();
    expect(
      screen.getByText(/tu désignes simplement le vainqueur de chaque match, sans score/),
    ).toBeTruthy();
    // Un choix fait en ligue ne suit pas en élimination.
    await user.click(screen.getByRole('button', { name: 'Ligue' }));
    await user.click(screen.getByRole('button', { name: 'Autorisés' }));
    await user.click(screen.getByRole('button', { name: 'Élimination directe' }));
    await user.click(screen.getByRole('button', { name: 'Créer le tournoi' }));
    await waitFor(() =>
      expect(created()).toMatchObject({ format: 'ELIMINATION', allowDraws: false }),
    );
  });
});
