import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { setCsrfToken } from '../api/client';
import type { Role } from '../api/types';
import { AuthProvider } from '../auth/session';

/** Double authentification : connexion en deux étapes, activation, ressaisie du code. */

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

const me = (role: Role, mfaEnabled: boolean, elevated = false) => ({
  user: { id: 'u1', username: 'owner', platoUsername: 'owner', role, mfaEnabled },
  csrfToken: 'csrf-1',
  elevatedUntil: elevated ? new Date(Date.now() + 600_000).toISOString() : null,
});

describe('connexion en deux étapes', () => {
  it('demande le code après le mot de passe, sans rien connecter entre les deux', async () => {
    handlers['GET /auth/me'] = () => ({ status: 401 });
    handlers['POST /auth/login'] = () => ({
      body: { mfaRequired: true, challenge: 'jeton-etape' },
    });
    handlers['POST /auth/login/mfa'] = () => ({
      body: me('PLATFORM_OWNER', true, true),
    });
    handlers['GET /groups'] = () => ({ body: [] });
    const u = renderApp('/connexion');
    await u.type(await screen.findByLabelText('Identifiant'), 'owner');
    await u.type(screen.getByLabelText('Mot de passe'), 'un-mot-de-passe-de-test');
    await u.click(screen.getByRole('button', { name: 'Se connecter' }));

    // Seconde étape : le champ du code remplace le mot de passe.
    const code = await screen.findByLabelText('Code de l’application d’authentification');
    expect(screen.queryByLabelText('Mot de passe')).toBeNull();
    await u.type(code, '123456');
    await u.click(screen.getByRole('button', { name: 'Valider le code' }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /auth/login/mfa')?.body).toEqual({
        challenge: 'jeton-etape',
        code: '123456',
      }),
    );
    expect(await screen.findByText(/Invite un super admin depuis l’onglet Moi/)).toBeTruthy();
  });

  it('un code faux laisse réessayer ; un jeton expiré renvoie au mot de passe', async () => {
    handlers['GET /auth/me'] = () => ({ status: 401 });
    handlers['POST /auth/login'] = () => ({
      body: { mfaRequired: true, challenge: 'jeton-etape' },
    });
    let attempt = 0;
    handlers['POST /auth/login/mfa'] = () => {
      attempt += 1;
      return attempt === 1
        ? { status: 401, body: { message: 'Code incorrect' } }
        : { status: 401, body: { message: 'Connexion expirée, recommence avec ton mot de passe' } };
    };
    const u = renderApp('/connexion');
    await u.type(await screen.findByLabelText('Identifiant'), 'owner');
    await u.type(screen.getByLabelText('Mot de passe'), 'un-mot-de-passe-de-test');
    await u.click(screen.getByRole('button', { name: 'Se connecter' }));
    await u.type(
      await screen.findByLabelText('Code de l’application d’authentification'),
      '000000',
    );
    await u.click(screen.getByRole('button', { name: 'Valider le code' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Code incorrect');
    // On reste sur l'étape du code.
    await u.type(screen.getByLabelText('Code de l’application d’authentification'), '111111');
    await u.click(screen.getByRole('button', { name: 'Valider le code' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Connexion expirée');
    expect(await screen.findByLabelText('Mot de passe')).toBeTruthy();
  });
});

describe('activation obligatoire pour le propriétaire', () => {
  it('le renvoie vers l’écran Sécurité, sans l’autoriser à aller ailleurs', async () => {
    handlers['GET /auth/me'] = () => ({ body: me('PLATFORM_OWNER', false) });
    handlers['GET /auth/mfa'] = () => ({
      body: { enabled: false, required: true, recoveryCodesLeft: 0 },
    });
    renderApp('/retours');
    expect(await screen.findByRole('heading', { name: 'Sécurité' })).toBeTruthy();
    expect(await screen.findByText(/obligatoire pour le propriétaire/)).toBeTruthy();
    expect(calls.some((c) => c.key.includes('/feedback'))).toBe(false);
    // Pas de bouton retour : il doit activer.
    expect(screen.queryByRole('link', { name: 'Retour' })).toBeNull();
  });

  it('active : QR code, premier code, puis codes de secours à garder', async () => {
    handlers['GET /auth/me'] = () => ({ body: me('PLATFORM_OWNER', false) });
    handlers['GET /auth/mfa'] = () => ({
      body: { enabled: false, required: true, recoveryCodesLeft: 0 },
    });
    handlers['POST /auth/mfa/setup'] = () => ({
      body: {
        secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
        otpauthUrl:
          'otpauth://totp/i-am-in:owner?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=i-am-in',
      },
    });
    handlers['POST /auth/mfa/enable'] = () => ({
      body: { recoveryCodes: ['aaaaa-bbbbb', 'ccccc-ddddd', 'eeeee-fffff'] },
    });
    const u = renderApp('/securite');
    await u.click(await screen.findByRole('button', { name: 'Commencer' }));
    // Le QR code est dessiné dans la page (SVG) : aucune image ni service externe.
    expect(await screen.findByRole('img', { name: /QR code/ })).toBeTruthy();
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP')).toBeTruthy();
    await u.type(screen.getByLabelText('Code à 6 chiffres'), '654321');
    await u.click(screen.getByRole('button', { name: 'Activer' }));
    expect(await screen.findByRole('heading', { name: 'Codes de secours' })).toBeTruthy();
    expect(screen.getByText('aaaaa-bbbbb')).toBeTruthy();
    expect(calls.find((c) => c.key === 'POST /auth/mfa/enable')?.body).toEqual({ code: '654321' });

    // On ne peut pas terminer sans avoir confirmé avoir gardé les codes.
    const done = screen.getByRole<HTMLButtonElement>('button', { name: 'Terminer' });
    expect(done.disabled).toBe(true);
    await u.click(screen.getByLabelText('J’ai gardé mes codes de secours'));
    expect(done.disabled).toBe(false);
  });

  it('le propriétaire déjà activé ne peut pas désactiver la double authentification', async () => {
    handlers['GET /auth/me'] = () => ({ body: me('PLATFORM_OWNER', true, true) });
    handlers['GET /auth/mfa'] = () => ({
      body: { enabled: true, required: true, recoveryCodesLeft: 10 },
    });
    handlers['GET /groups'] = () => ({ body: [] });
    renderApp('/securite');
    expect(await screen.findByText(/obligatoire pour ton compte/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Désactiver/ })).toBeNull();
    expect(screen.getByText(/10 codes de secours restants/)).toBeTruthy();
  });
});

describe('sessions et activité', () => {
  const owner = () => {
    handlers['GET /auth/me'] = () => ({ body: me('PLATFORM_OWNER', true, true) });
    handlers['GET /groups'] = () => ({ body: [] });
    handlers['GET /auth/mfa'] = () => ({
      body: { enabled: true, required: true, recoveryCodesLeft: 10 },
    });
  };

  it('liste les sessions, repère la mienne, et ferme une autre après confirmation', async () => {
    owner();
    let rows = [
      {
        id: 's1',
        device: 'Chrome · Windows',
        createdAt: '2026-11-24T08:00:00Z',
        lastSeenAt: '2026-11-24T09:00:00Z',
        current: true,
      },
      {
        id: 's2',
        device: 'Safari · iOS',
        createdAt: '2026-11-23T08:00:00Z',
        lastSeenAt: '2026-11-23T09:00:00Z',
        current: false,
      },
    ];
    handlers['GET /auth/sessions'] = () => ({ body: rows });
    handlers['GET /auth/activity'] = () => ({ body: [] });
    handlers['DELETE /auth/sessions/s2'] = () => {
      rows = rows.filter((r) => r.id !== 's2');
      return { status: 204 };
    };
    const u = renderApp('/securite');
    expect(await screen.findByText('Safari · iOS')).toBeTruthy();
    expect(screen.getByText('CETTE SESSION')).toBeTruthy();
    // Pas de bouton « Fermer » pour la session en cours : il y a la déconnexion.
    expect(screen.getAllByRole('button', { name: 'Fermer' })).toHaveLength(1);
    await u.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(calls.some((c) => c.key === 'DELETE /auth/sessions/s2')).toBe(false);
    await u.click(screen.getByRole('button', { name: 'Fermer la session' }));
    await waitFor(() => expect(calls.some((c) => c.key === 'DELETE /auth/sessions/s2')).toBe(true));
    await waitFor(() => expect(screen.queryByText('Safari · iOS')).toBeNull());
  });

  it('affiche le journal et signale ce qui est à vérifier, sans adresse IP', async () => {
    owner();
    handlers['GET /auth/sessions'] = () => ({ body: [] });
    handlers['GET /auth/activity'] = () => ({
      body: [
        {
          id: 'e1',
          type: 'LOGIN_FAILED',
          device: 'Firefox · Linux',
          createdAt: '2026-11-24T09:00:00Z',
        },
        {
          id: 'e2',
          type: 'LOGIN_OK',
          device: 'Chrome · Windows',
          createdAt: '2026-11-24T08:00:00Z',
        },
        { id: 'e3', type: 'RESET_LINK_ISSUED', device: null, createdAt: '2026-11-23T08:00:00Z' },
      ],
    });
    renderApp('/securite');
    expect(await screen.findByText('Mot de passe incorrect')).toBeTruthy();
    expect(screen.getByText('Connexion réussie')).toBeTruthy();
    expect(screen.getByText('Lien de réinitialisation émis pour ce compte')).toBeTruthy();
    // Deux événements sur trois sont à vérifier ; une connexion réussie ne l'est pas.
    expect(screen.getAllByText('À VÉRIFIER')).toHaveLength(2);
  });

  it('un propriétaire qui n’a pas activé la double authentification ne voit ni sessions ni journal', async () => {
    handlers['GET /auth/me'] = () => ({ body: me('PLATFORM_OWNER', false) });
    handlers['GET /auth/mfa'] = () => ({
      body: { enabled: false, required: true, recoveryCodesLeft: 0 },
    });
    renderApp('/securite');
    await screen.findByRole('button', { name: 'Commencer' });
    expect(calls.some((c) => c.key === 'GET /auth/sessions')).toBe(false);
    expect(calls.some((c) => c.key === 'GET /auth/activity')).toBe(false);
  });
});

describe('ressaisie du code avant une action sensible', () => {
  it('bloque la création d’un lien tant que le code n’est pas redonné', async () => {
    let elevated = false;
    handlers['GET /auth/me'] = () => ({ body: me('PLATFORM_OWNER', true, elevated) });
    handlers['GET /groups'] = () => ({ body: [] });
    handlers['GET /creator-invitations'] = () => ({ body: [] });
    handlers['POST /auth/mfa/elevate'] = () => {
      elevated = true;
      return { body: { elevatedUntil: new Date(Date.now() + 600_000).toISOString() } };
    };
    const u = renderApp('/super-admins');
    const create = await screen.findByRole<HTMLButtonElement>('button', {
      name: 'Créer un lien d’invitation',
    });
    expect(create.disabled).toBe(true);
    await u.type(screen.getByLabelText('Code à 6 chiffres'), '123456');
    await u.click(screen.getByRole('button', { name: 'Confirmer' }));
    await waitFor(() =>
      expect(calls.find((c) => c.key === 'POST /auth/mfa/elevate')?.body).toEqual({
        code: '123456',
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Créer un lien d’invitation' })
          .disabled,
      ).toBe(false),
    );
    expect(screen.queryByRole('form', { name: 'Confirmer avec ton code' })).toBeNull();
  });
});
