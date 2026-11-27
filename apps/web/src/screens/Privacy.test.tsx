import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import type { PublicView } from '../api/types';
import { AuthProvider } from '../auth/session';
import { formatWhen, isoToLocalInput, localInputToIso } from '../lib/datetime';
import { I18nProvider } from '../lib/i18n';

/** La page de confidentialité (publique) et la date du tournoi sur la page des joueurs. */

const SLUG = 'p'.repeat(22);
let view: PublicView;
let paths: string[];

beforeEach(() => {
  paths = [];
  localStorage.clear();
  localStorage.setItem('iamin-lang', 'fr');
  view = {
    name: 'Coupe',
    format: 'ELIMINATION',
    status: 'REGISTRATION',
    language: 'fr',
    startsAt: '2026-12-05T19:30:00.000Z',
    registrationOpen: true,
    revision: 1,
    drawn: false,
    players: [],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const path = new URL(url).pathname;
      paths.push(path);
      const body = path === `/public/tournaments/${SLUG}/view` ? view : undefined;
      return Promise.resolve(
        new Response(JSON.stringify(body ?? { message: 'non connecté' }), {
          status: body === undefined ? 401 : 200,
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

const frDate = (value: string | number | Date, options?: Intl.DateTimeFormatOptions) =>
  new Date(value).toLocaleString('fr', options);

describe('date du tournoi', () => {
  it('la page des joueurs la montre à l’heure de l’appareil, avec le fuseau', async () => {
    renderAt(`/t/${SLUG}`);
    const expected = formatWhen('2026-12-05T19:30:00.000Z', frDate);
    const time = await screen.findByText(expected);
    expect(time.getAttribute('datetime')).toBe('2026-12-05T19:30:00.000Z');
    expect(expected).toMatch(/2026/);
    expect(expected).toMatch(/UTC|GMT|HNEC|CET/);
  });

  it('un tournoi sans date le dit', async () => {
    view = { ...view, startsAt: null };
    renderAt(`/t/${SLUG}`);
    expect(await screen.findByText('Date non précisée')).toBeTruthy();
  });

  it('la saisie locale et l’heure UTC se correspondent dans les deux sens', () => {
    const iso = localInputToIso('2026-12-05T20:30');
    expect(iso).toBe(new Date('2026-12-05T20:30').toISOString());
    expect(isoToLocalInput(iso)).toBe('2026-12-05T20:30');
    expect(localInputToIso('')).toBeNull();
    expect(localInputToIso('n’importe quoi')).toBeNull();
    expect(isoToLocalInput(null)).toBe('');
  });
});

describe('confidentialité', () => {
  it('se lit sans compte, avec toutes ses rubriques', async () => {
    renderAt('/confidentialite');
    for (const title of [
      'Responsable',
      'Si tu es joueur (sans compte)',
      'Si tu es admin (avec un compte)',
      'Avis et journal technique',
      'Sur ton appareil',
      'Durées',
      'Tes droits',
    ]) {
      expect(await screen.findByRole('heading', { name: title }), title).toBeTruthy();
    }
    // Elle ne promet pas ce que l'application ne fait pas encore.
    expect(screen.getByText(/Il n’y a pas encore de suppression automatique/)).toBeTruthy();
    expect(screen.getByText(/la date de ta dernière activité/)).toBeTruthy();
    expect(screen.getByText(/CNIL/)).toBeTruthy();
  });

  it('existe en anglais et en espagnol', async () => {
    const user = renderAt('/confidentialite');
    await user.click(await screen.findByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { name: 'Your rights' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Español' }));
    expect(screen.getByRole('heading', { name: 'Tus derechos' })).toBeTruthy();
  });

  it('est liée depuis l’inscription d’un joueur', async () => {
    renderAt(`/t/${SLUG}`);
    const links = await screen.findAllByRole('link', { name: 'Confidentialité' });
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links.every((a) => a.getAttribute('href') === '/confidentialite')).toBe(true);
  });

  it('est liée depuis la création d’un compte et la connexion', async () => {
    renderAt('/invitation/un-jeton-d-invitation-de-test');
    const link = await screen.findByRole('link', { name: 'Confidentialité' });
    expect(link.getAttribute('href')).toBe('/confidentialite');
  });
});
