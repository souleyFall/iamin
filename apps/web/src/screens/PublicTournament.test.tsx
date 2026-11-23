import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import type { MyRegistration, PublicView } from '../api/types';
import { AuthProvider } from '../auth/session';

const SLUG = 'a'.repeat(22);
const TOKEN_KEY = `iamin-player-${SLUG}`;

const open: PublicView = {
  name: 'Échecs #12',
  format: 'ELIMINATION',
  status: 'REGISTRATION',
  language: 'fr',
  registrationOpen: true,
  revision: 3,
  drawn: false,
  players: [
    { id: 'p1', platoName: 'Sana.fx', status: 'ACCEPTED' },
    { id: 'p2', platoName: 'Mehdi', status: 'WAITLIST' },
  ],
};

const mine = (over: Partial<MyRegistration> = {}): MyRegistration => ({
  id: 'r9',
  platoName: 'Karim_77',
  status: 'PENDING',
  presence: 'UNKNOWN',
  waitlistPosition: null,
  tournament: { name: 'Échecs #12', status: 'REGISTRATION' },
  ...over,
});

// Une ligue tirée, avec un match joué : le strict nécessaire pour la page publique.
const league = {
  name: 'Ligue du soir',
  format: 'LEAGUE',
  status: 'STARTED',
  language: 'fr',
  registrationOpen: false,
  revision: 9,
  drawn: true,
  seed: 'graine-publique',
  drawnAt: '2026-11-22T20:00:00Z',
  initialPlayers: ['p1', 'p2'],
  forfeitScore: 1,
  players: [
    { id: 'p1', platoName: 'Sana.fx', status: 'ACCEPTED' },
    { id: 'p2', platoName: 'Mehdi', status: 'ACCEPTED' },
  ],
  forfeits: {},
  scores: { M1: { a: 3, b: 1 } },
  schedule: { legs: 1, rounds: [[{ id: 'M1', a: 'p1', b: 'p2' }]], rests: [null] },
  standings: {
    played: 1,
    total: 1,
    rows: [
      { rank: 1, playerId: 'p1', points: 3, wins: 1, losses: 0, scoreDiff: 2 },
      { rank: 2, playerId: 'p2', points: 0, wins: 0, losses: 1, scoreDiff: -2 },
    ],
  },
} as unknown as PublicView;

type Handler = (
  body: unknown,
  headers: Record<string, string>,
) => { status?: number; body?: unknown };
let handlers: Record<string, Handler>;
let calls: { key: string; headers: Record<string, string>; body: unknown }[];

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

beforeEach(() => {
  calls = [];
  handlers = {};
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      const path = new URL(url).pathname;
      const key = `${init.method ?? 'GET'} ${path}`;
      const headers = (init.headers ?? {}) as Record<string, string>;
      const body = typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      calls.push({ key, headers, body });
      const handler = handlers[key];
      if (!handler) return Promise.resolve(json(404, { message: `non géré : ${key}` }));
      const out = handler(body, headers);
      return Promise.resolve(json(out.status ?? 200, out.body));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderPublic() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/t/${SLUG}`]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup();
}

const viewPath = `GET /public/tournaments/${SLUG}/view`;

describe('page publique', () => {
  it('explique qu’un lien inconnu ne mène à aucun tournoi', async () => {
    handlers[viewPath] = () => ({ status: 404, body: { message: 'Tournoi introuvable' } });
    renderPublic();
    expect(await screen.findByText(/ne correspond à aucun tournoi/)).toBeTruthy();
  });

  it('ne demande aucune connexion et ne montre que les inscrits validés et la liste d’attente', async () => {
    handlers[viewPath] = () => ({ body: open });
    renderPublic();
    expect(await screen.findByRole('heading', { name: 'Échecs #12' })).toBeTruthy();
    expect(screen.getByText('Sana.fx')).toBeTruthy();
    expect(screen.getByText('Mehdi')).toBeTruthy();
    // Aucune donnée de groupe n'est demandée : la page est publique. (`/auth/me` part au chargement
    // de toute page et répond 401 à un visiteur : sans effet.)
    expect(calls.some((c) => c.key.includes('/groups'))).toBe(false);
  });

  it('inscrit le joueur, garde son lien personnel sur l’appareil et affiche son statut', async () => {
    handlers[viewPath] = () => ({ body: open });
    handlers[`POST /public/tournaments/${SLUG}/registrations`] = () => ({
      body: { registration: { id: 'r9' }, token: 'jeton-secret-du-joueur' },
    });
    handlers['GET /public/registration'] = (_b, headers) =>
      headers['x-player-token'] === 'jeton-secret-du-joueur'
        ? { body: mine() }
        : { status: 404, body: {} };
    const user = renderPublic();
    await user.type(await screen.findByLabelText('Ton pseudo Plato'), '  Karim_77 ');
    await user.click(screen.getByRole('button', { name: 'Envoyer mon inscription' }));

    expect(await screen.findByText('En attente de validation par un admin.')).toBeTruthy();
    expect(
      calls.find((c) => c.key === `POST /public/tournaments/${SLUG}/registrations`)?.body,
    ).toEqual({
      name: 'Karim_77',
    });
    expect(localStorage.getItem(TOKEN_KEY)).toBe('jeton-secret-du-joueur');
    // Le jeton voyage dans l'en-tête, jamais dans l'adresse.
    expect(calls.some((c) => c.key.includes('jeton-secret'))).toBe(false);
  });

  it('annonce la position sur la liste d’attente', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok');
    handlers[viewPath] = () => ({ body: open });
    handlers['GET /public/registration'] = () => ({
      body: mine({ status: 'WAITLIST', waitlistPosition: 2 }),
    });
    renderPublic();
    expect(await screen.findByText(/Liste d’attente : tu es n°2/)).toBeTruthy();
  });

  it('annule l’inscription, oublie le lien et rouvre le formulaire', async () => {
    localStorage.setItem(TOKEN_KEY, 'tok');
    handlers[viewPath] = () => ({ body: open });
    handlers['GET /public/registration'] = () => ({ body: mine({ status: 'ACCEPTED' }) });
    handlers['DELETE /public/registration'] = () => ({ status: 204 });
    const user = renderPublic();
    await user.click(await screen.findByRole('button', { name: 'Annuler mon inscription' }));
    await user.click(screen.getByRole('button', { name: 'Oui, annuler' }));

    expect(await screen.findByLabelText('Ton pseudo Plato')).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(
      calls.find((c) => c.key === 'DELETE /public/registration')?.headers['x-player-token'],
    ).toBe('tok');
  });

  it('oublie un lien périmé (inscription supprimée par un admin)', async () => {
    localStorage.setItem(TOKEN_KEY, 'vieux');
    handlers[viewPath] = () => ({ body: open });
    handlers['GET /public/registration'] = () => ({
      status: 404,
      body: { message: 'Introuvable' },
    });
    const user = renderPublic();
    expect(await screen.findByText(/Ton inscription n’existe plus/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'D’accord' }));
    expect(await screen.findByLabelText('Ton pseudo Plato')).toBeTruthy();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('ferme le formulaire quand les inscriptions sont closes', async () => {
    handlers[viewPath] = () => ({ body: { ...open, status: 'CHECK_IN', registrationOpen: false } });
    renderPublic();
    expect(await screen.findByText('Les inscriptions sont closes.')).toBeTruthy();
    expect(screen.queryByLabelText('Ton pseudo Plato')).toBeNull();
  });

  it('montre les matchs, le classement et la graine après le tirage', async () => {
    handlers[viewPath] = () => ({ body: league });
    renderPublic();
    expect(await screen.findByRole('heading', { name: 'Ligue du soir' })).toBeTruthy();
    expect(screen.getByText('Match 1')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Classement (1/1)' })).toBeTruthy();
    expect(screen.getByText('graine-publique')).toBeTruthy();
    // Page publique : aucune saisie de score possible.
    expect(screen.queryByRole('button', { name: /Saisir le score/ })).toBeNull();
  });
});

describe('direct', () => {
  class FakeSource {
    static last: FakeSource | undefined;
    listeners: Record<string, () => void> = {};
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
    closed = false;
    constructor(readonly url: string) {
      FakeSource.last = this;
    }
    addEventListener(type: string, fn: () => void) {
      this.listeners[type] = fn;
    }
    close() {
      this.closed = true;
    }
  }

  it('relit la vue à chaque message « changed » et ferme le flux en quittant', async () => {
    vi.stubGlobal('EventSource', FakeSource);
    let revision = 3;
    handlers[viewPath] = () => ({ body: { ...open, revision } });
    renderPublic();
    await screen.findByRole('heading', { name: 'Échecs #12' });
    const source = FakeSource.last;
    expect(source?.url.endsWith(`/public/tournaments/${SLUG}/live`)).toBe(true);

    act(() => source?.onopen?.());
    expect(await screen.findByText('EN DIRECT')).toBeTruthy();

    const before = calls.filter((c) => c.key === viewPath).length;
    revision = 4;
    act(() => source?.listeners['changed']?.());
    await waitFor(() => expect(calls.filter((c) => c.key === viewPath).length).toBe(before + 1));
  });

  it('met aussi à jour le statut du joueur quand un admin valide son inscription', async () => {
    vi.stubGlobal('EventSource', FakeSource);
    localStorage.setItem(TOKEN_KEY, 'tok');
    let status: MyRegistration['status'] = 'PENDING';
    handlers[viewPath] = () => ({ body: open });
    handlers['GET /public/registration'] = () => ({ body: mine({ status }) });
    renderPublic();
    expect(await screen.findByText('En attente de validation par un admin.')).toBeTruthy();

    status = 'ACCEPTED';
    act(() => FakeSource.last?.listeners['changed']?.());
    expect(await screen.findByText('Inscription validée. Tu as ta place.')).toBeTruthy();
  });
});
