import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setCsrfToken } from '../api/client';
import type { PublicView, Tournament } from '../api/types';
import { AuthProvider } from '../auth/session';
import { chatChoices } from '../lib/chat';
import { I18nProvider, translate } from '../lib/i18n';

/** Langue d'un tournoi : page des joueurs, texte du chat, réglage par l'admin (D27). */

const SLUG = 'b'.repeat(22);
const view = (language: 'fr' | 'en' | 'es'): PublicView => ({
  name: 'Coupe',
  format: 'ELIMINATION',
  status: 'REGISTRATION',
  language,
  registrationOpen: true,
  revision: 1,
  drawn: false,
  players: [{ id: 'p1', platoName: 'Sana.fx', status: 'ACCEPTED' }],
});

type Handler = (body: unknown) => { status?: number; body?: unknown };
let handlers: Record<string, Handler>;
let calls: { key: string; body: unknown }[];

beforeEach(() => {
  calls = [];
  handlers = {};
  localStorage.clear();
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

describe('page des joueurs', () => {
  const route = `GET /public/tournaments/${SLUG}/view`;

  it('s’affiche dans la langue du tournoi, sans que le joueur ait rien choisi', async () => {
    handlers[route] = () => ({ body: view('en') });
    renderAt(`/t/${SLUG}`);
    expect(await screen.findByRole('heading', { name: 'Register' })).toBeTruthy();
    expect(screen.getByText('Registered · 1')).toBeTruthy();
    expect(document.documentElement.lang).toBe('en');
  });

  it('le joueur peut en changer pour lui-même, et son choix reste sur son appareil', async () => {
    handlers[route] = () => ({ body: view('en') });
    const user = renderAt(`/t/${SLUG}`);
    await user.click(await screen.findByRole('button', { name: 'Español' }));
    expect(await screen.findByText('Inscritos · 1')).toBeTruthy();
    expect(localStorage.getItem('iamin-lang')).toBe('es');
    // Rien n'est envoyé au serveur : la langue du joueur ne quitte pas son appareil.
    expect(calls.every((c) => c.key.startsWith('GET'))).toBe(true);
  });

  it('un choix déjà fait par le joueur passe avant la langue du tournoi', async () => {
    localStorage.setItem('iamin-lang', 'fr');
    handlers[route] = () => ({ body: view('es') });
    renderAt(`/t/${SLUG}`);
    expect(await screen.findByText('Inscrits · 1')).toBeTruthy();
  });
});

const me = {
  user: { id: 'u1', username: 'alice', platoUsername: 'a', role: 'MEMBER', mfaEnabled: false },
  csrfToken: 'c',
};
const group = { id: 'g1', name: 'Les Stratèges', myRole: 'ADMIN', memberCount: 2 };

const tournament = (over: Partial<Tournament> = {}): Tournament => ({
  id: 't1',
  name: 'Échecs #12',
  format: 'ELIMINATION',
  capacity: 8,
  status: 'REGISTRATION',
  publicSlug: 's'.repeat(22),
  forfeitScore: 1,
  language: 'fr',
  createdAt: '2026-11-22T10:00:00Z',
  drawnAt: null,
  drawSeed: null,
  holder: { id: 'u1', username: 'alice' },
  handoverTo: null,
  registrations: [
    { id: 'r1', platoName: 'Sana.fx', status: 'ACCEPTED', presence: 'UNKNOWN', createdAt: '' },
  ],
  ...over,
});

function signedIn() {
  handlers['GET /auth/me'] = () => ({ body: me });
  handlers['GET /groups'] = () => ({ body: [group] });
  handlers['GET /groups/g1'] = () => ({ body: { ...group, members: [] } });
}

describe('réglage par l’admin', () => {
  it('la création propose la langue de l’écran, modifiable avant d’envoyer', async () => {
    localStorage.setItem('iamin-lang', 'es');
    signedIn();
    handlers['POST /groups/g1/tournaments'] = () => ({ status: 201, body: tournament() });
    handlers['GET /groups/g1/tournaments'] = () => ({ body: [] });
    handlers['GET /groups/g1/tournaments/t1'] = () => ({ body: tournament() });
    const user = renderAt('/nouveau');
    const spanish = await screen.findByRole('button', { name: 'Español' });
    expect(spanish.getAttribute('aria-pressed')).toBe('true');
    await user.type(screen.getByLabelText('Nombre del torneo'), 'Copa de otoño');
    await user.click(screen.getByRole('button', { name: 'English' }));
    await user.click(screen.getByRole('button', { name: 'Crear el torneo' }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /groups/g1/tournaments')?.body).toMatchObject({
        name: 'Copa de otoño',
        language: 'en',
      }),
    );
  });

  it('le détenteur change la langue d’un tournoi depuis l’onglet Inscrits', async () => {
    signedIn();
    handlers['GET /groups/g1/tournaments/t1'] = () => ({ body: tournament() });
    handlers['PATCH /groups/g1/tournaments/t1'] = () => ({ body: tournament({ language: 'en' }) });
    const user = renderAt('/tournois/t1/inscrits');
    const buttons = await screen.findAllByRole('button', { name: 'English' });
    const english = buttons[buttons.length - 1];
    if (!english) throw new Error('bouton absent');
    await user.click(english);
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'PATCH /groups/g1/tournaments/t1')?.body).toEqual({
        language: 'en',
      }),
    );
  });

  it('un admin qui n’a pas la main voit la langue sans pouvoir la changer', async () => {
    signedIn();
    handlers['GET /groups/g1/tournaments/t1'] = () => ({
      body: tournament({ holder: { id: 'u2', username: 'sana' } }),
    });
    renderAt('/tournois/t1/inscrits');
    const buttons = await screen.findAllByRole<HTMLButtonElement>('button', { name: 'English' });
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });
});

describe('texte du chat', () => {
  const tr = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate('fr', key, params);

  it('suit la langue du tournoi, pas celle de l’écran', () => {
    const t = tournament({ language: 'es', capacity: 4 });
    const [registrations] = chatChoices(t, undefined, tr);
    // Le menu reste dans la langue de l'écran (français) ; le message, lui, est en espagnol.
    expect(registrations?.label).toBe('Liste des inscrits');
    expect(registrations?.text).toBe('Échecs #12\nInscritos: 1/4 plazas\n1. Sana.fx');
    expect(chatChoices(tournament({ language: 'en', capacity: 4 }), undefined, tr)[0]?.text).toBe(
      'Échecs #12\nRegistered: 1/4 spots\n1. Sana.fx',
    );
    expect(chatChoices(tournament({ capacity: 4 }), undefined, tr)[0]?.text).toBe(
      'Échecs #12\nInscrits : 1/4 places\n1. Sana.fx',
    );
  });
});
