/**
 * Sécurité du compte : verrouillage par compte ET adresse, sessions actives, journal de sécurité,
 * mot de passe du propriétaire. Même fonctionnement que les autres tests d'intégration.
 */
import { Role } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { deviceLabel } from './device';
import { OWNER_PASSWORD_MIN, ownerPasswordProblem } from './schemas';
import { SECURITY_EVENT_TTL_MS } from './security.service';
import {
  Client,
  createUser,
  randomPassword,
  resetDatabase,
  startApp,
  testDatabaseUrl,
  totpCodeFor,
  type TestApp,
} from './test-harness';

if (!testDatabaseUrl) {
  console.warn('⚠ TEST_DATABASE_URL absent : les tests de sécurité du compte sont ignorés.');
}

const PASSWORD = randomPassword();
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

interface Event {
  type: string;
  device: string | null;
  createdAt: string;
}
interface SessionRow {
  id: string;
  device: string | null;
  current: boolean;
}

describe('appareil lisible', () => {
  it.each([
    [CHROME_WINDOWS, 'Chrome · Windows'],
    [SAFARI_IPHONE, 'Safari · iOS'],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0',
      'Edge · Windows',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox · Linux'],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
      'Chrome · Android',
    ],
    [undefined, 'Navigateur · système inconnu'],
    ['curl/8.0', 'Navigateur · système inconnu'],
  ])('%s -> %s', (ua, label) => {
    expect(deviceLabel(ua)).toBe(label);
  });

  it('ne garde jamais le texte brut : une version précise n’apparaît pas', () => {
    expect(deviceLabel(CHROME_WINDOWS)).not.toMatch(/130|537|NT 10/);
  });
});

describe('mot de passe du propriétaire', () => {
  it('refuse moins de 16 caractères, et son identifiant dans le mot de passe', () => {
    expect(ownerPasswordProblem('souley', 'x'.repeat(OWNER_PASSWORD_MIN - 1))).toMatch(
      /16 caractères/,
    );
    expect(ownerPasswordProblem('souley', 'MonSouleyEstLeMeilleur2026')).toMatch(/identifiant/);
    expect(ownerPasswordProblem('souley', 'un-long-mot-de-passe-sans-rien')).toBeNull();
  });
});

describe.skipIf(!testDatabaseUrl)('sécurité du compte (base réelle)', () => {
  let t: TestApp;
  const client = () => new Client(t.url);
  /** Derrière un proxy de confiance, l'adresse vient de `x-forwarded-for` : on simule plusieurs visiteurs. */
  const from = (ip: string, ua = CHROME_WINDOWS) => ({
    'x-forwarded-for': ip,
    'user-agent': ua,
  });

  beforeAll(async () => {
    t = await startApp({ trustProxy: 1 });
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  const alice = () =>
    createUser(t.prisma, { username: 'alice', password: PASSWORD, role: Role.MEMBER });
  const attempt = (ip: string, password: string, username = 'alice') =>
    client().request('POST', '/auth/login', { username, password }, { headers: from(ip) });

  // Les compteurs de tentatives sont en mémoire et durent 15 minutes, d'un test à l'autre : chaque
  // test de verrouillage a donc son propre compte.
  describe('verrouillage par compte et adresse (R25)', () => {
    const account = (name: string) =>
      createUser(t.prisma, { username: name, password: PASSWORD, role: Role.MEMBER });

    it('une adresse qui s’acharne se bloque seule : le titulaire, ailleurs, se connecte', async () => {
      await account('lock1');
      for (let i = 0; i < 10; i++) {
        expect((await attempt('198.51.100.7', randomPassword(), 'lock1')).status).toBe(401);
      }
      // L'adresse de l'attaquant est bloquée, même avec le bon mot de passe.
      expect((await attempt('198.51.100.7', PASSWORD, 'lock1')).status).toBe(429);
      // Le titulaire, depuis une autre adresse, n'est pas touché.
      expect((await attempt('203.0.113.20', PASSWORD, 'lock1')).status).toBe(200);
    });

    it('une attaque répartie sur beaucoup d’adresses finit par bloquer le compte pour tous', async () => {
      await account('lock2');
      for (let i = 0; i < 50; i++) {
        await attempt(`192.0.2.${i + 1}`, randomPassword(), 'lock2');
      }
      expect((await attempt('203.0.113.99', PASSWORD, 'lock2')).status).toBe(429);
    });

    it('un succès n’efface pas les échecs des autres adresses', async () => {
      await account('lock3');
      for (let i = 0; i < 49; i++) await attempt(`192.0.2.${i + 1}`, randomPassword(), 'lock3');
      expect((await attempt('203.0.113.20', PASSWORD, 'lock3')).status).toBe(200); // 49 échecs : pas encore
      await attempt('192.0.2.200', randomPassword(), 'lock3'); // le 50e échec
      expect((await attempt('203.0.113.21', PASSWORD, 'lock3')).status).toBe(429);
    });

    it('le blocage laisse une trace dans le journal du titulaire, sans changer la réponse', async () => {
      await account('lock4');
      for (let i = 0; i < 10; i++) await attempt('198.51.100.7', randomPassword(), 'lock4');
      const locked = await attempt('198.51.100.7', PASSWORD, 'lock4');
      const unknown = await attempt('198.51.100.8', PASSWORD, 'personne');
      expect(locked.status).toBe(429);
      expect(unknown.status).toBe(401); // un compte inconnu ne se distingue pas d'un mauvais mot de passe
      const types = (await t.prisma.securityEvent.findMany()).map((e) => e.type);
      expect(types).toContain('ACCOUNT_LOCKED');
      expect(types).toContain('LOGIN_FAILED');
    });
  });
  describe('sessions actives', () => {
    async function login(ip: string, ua: string) {
      const c = client();
      expect((await c.login('alice', PASSWORD, from(ip, ua))).status).toBe(200);
      return c;
    }

    it('liste mes sessions avec leur appareil, repère la mienne, rien de plus', async () => {
      await alice();
      const pc = await login('203.0.113.1', CHROME_WINDOWS);
      await login('203.0.113.2', SAFARI_IPHONE);
      const list = (await pc.request('GET', '/auth/sessions')).body as SessionRow[];
      expect(list.map((s) => s.device).sort()).toEqual(['Chrome · Windows', 'Safari · iOS']);
      expect(list.filter((s) => s.current)).toHaveLength(1);
      expect(list.find((s) => s.current)?.device).toBe('Chrome · Windows');
      // Ni jeton, ni empreinte, ni adresse.
      expect(JSON.stringify(list)).not.toMatch(/tokenHash|csrfToken|203\.0\.113/);
    });

    it('ferme une autre session, jamais la mienne, jamais celle d’un autre compte', async () => {
      await alice();
      await createUser(t.prisma, { username: 'bob', password: PASSWORD, role: Role.MEMBER });
      const pc = await login('203.0.113.1', CHROME_WINDOWS);
      const phone = await login('203.0.113.2', SAFARI_IPHONE);
      const bob = client();
      await bob.login('bob', PASSWORD);

      const list = (await pc.request('GET', '/auth/sessions')).body as SessionRow[];
      const mine = list.find((s) => s.current)?.id ?? '';
      const other = list.find((s) => !s.current)?.id ?? '';
      expect((await pc.request('DELETE', `/auth/sessions/${mine}`)).status).toBe(404);
      const bobSession = (await bob.request('GET', '/auth/sessions')).body as SessionRow[];
      expect((await pc.request('DELETE', `/auth/sessions/${bobSession[0]?.id ?? ''}`)).status).toBe(
        404,
      );
      expect((await bob.request('GET', '/auth/me')).status).toBe(200);

      expect((await pc.request('DELETE', `/auth/sessions/${other}`)).status).toBe(204);
      expect((await phone.request('GET', '/auth/me')).status).toBe(401);
      expect((await pc.request('GET', '/auth/me')).status).toBe(200);
      expect((await pc.request('DELETE', '/auth/sessions/pas-un-uuid')).status).toBe(400);
    });

    it('« fermer les autres » garde seulement la session en cours', async () => {
      await alice();
      const pc = await login('203.0.113.1', CHROME_WINDOWS);
      const phone = await login('203.0.113.2', SAFARI_IPHONE);
      expect((await pc.request('POST', '/auth/sessions/close-others')).status).toBe(204);
      expect((await phone.request('GET', '/auth/me')).status).toBe(401);
      expect((await pc.request('GET', '/auth/me')).status).toBe(200);
      expect(await t.prisma.session.count()).toBe(1);
    });

    it('sans connexion, rien n’est lisible', async () => {
      for (const [method, path] of [
        ['GET', '/auth/sessions'],
        ['GET', '/auth/activity'],
        ['POST', '/auth/sessions/close-others'],
      ] as const) {
        expect((await client().request(method, path)).status).toBe(401);
      }
    });
  });

  describe('journal de sécurité', () => {
    it('note les connexions, avec l’appareil et sans adresse IP', async () => {
      await alice();
      const c = client();
      await c.login('alice', PASSWORD, from('203.0.113.1', SAFARI_IPHONE));
      const events = (await c.request('GET', '/auth/activity')).body as Event[];
      expect(events).toEqual([
        expect.objectContaining({ type: 'LOGIN_OK', device: 'Safari · iOS' }),
      ]);
      const stored = JSON.stringify(await t.prisma.securityEvent.findMany());
      expect(stored).not.toMatch(/203\.0\.113|Mozilla|AppleWebKit/);
    });

    it('un mot de passe faux n’écrit qu’une ligne par période, même sous rafale', async () => {
      await alice();
      for (let i = 0; i < 6; i++) await attempt('198.51.100.7', randomPassword());
      expect(await t.prisma.securityEvent.count({ where: { type: 'LOGIN_FAILED' } })).toBe(1);
    });

    it('chacun ne lit que son propre journal', async () => {
      await alice();
      await createUser(t.prisma, { username: 'bob', password: PASSWORD, role: Role.MEMBER });
      const a = client();
      await a.login('alice', PASSWORD);
      const b = client();
      await b.login('bob', PASSWORD);
      await attempt('198.51.100.7', randomPassword(), 'alice'); // échec visible chez alice seulement
      const bobs = (await b.request('GET', '/auth/activity')).body as Event[];
      expect(bobs.map((e) => e.type)).toEqual(['LOGIN_OK']);
      const alices = (await a.request('GET', '/auth/activity')).body as Event[];
      expect(alices.map((e) => e.type).sort()).toEqual(['LOGIN_FAILED', 'LOGIN_OK']);
    });

    it('note le changement de mot de passe, la fermeture des sessions et le lien de réinitialisation émis', async () => {
      await createUser(t.prisma, {
        username: 'owner',
        password: PASSWORD,
        role: Role.PLATFORM_OWNER,
      });
      const user = await alice();
      const c = client();
      await c.login('alice', PASSWORD);
      const next = randomPassword();
      expect(
        (
          await c.request('POST', '/auth/change-password', {
            currentPassword: PASSWORD,
            newPassword: next,
          })
        ).status,
      ).toBe(204);
      await c.request('POST', '/auth/sessions/close-others');

      // Le propriétaire émet un lien pour alice : elle le voit dans son journal.
      const ticket = await t.prisma.resetTicket.create({ data: { userId: user.id } });
      const owner = client();
      await owner.login('owner', PASSWORD);
      expect((await owner.request('POST', `/reset-tickets/${ticket.id}/issue`)).status).toBe(201);

      const types = ((await c.request('GET', '/auth/activity')).body as Event[]).map((e) => e.type);
      expect(types).toEqual(
        expect.arrayContaining(['PASSWORD_CHANGED', 'SESSIONS_REVOKED', 'RESET_LINK_ISSUED']),
      );
    });

    it('note l’activation, l’usage d’un code de secours et la régénération', async () => {
      await createUser(t.prisma, {
        username: 'owner',
        password: PASSWORD,
        role: Role.PLATFORM_OWNER,
      });
      const c = client();
      await c.login('owner', PASSWORD);
      const codes = (
        await c.request('POST', '/auth/mfa/recovery-codes', { code: totpCodeFor('owner', 1) })
      ).body as { recoveryCodes: string[] };
      const again = client();
      const start = (
        await again.request('POST', '/auth/login', { username: 'owner', password: PASSWORD })
      ).body as { challenge: string };
      expect(
        (
          await again.request('POST', '/auth/login/mfa', {
            challenge: start.challenge,
            code: codes.recoveryCodes[0],
          })
        ).status,
      ).toBe(200);
      const types = (await t.prisma.securityEvent.findMany()).map((e) => e.type);
      expect(types).toEqual(
        expect.arrayContaining(['RECOVERY_REGENERATED', 'RECOVERY_USED', 'LOGIN_OK']),
      );
    });

    it('un code faux est noté, une fois par période', async () => {
      await createUser(t.prisma, {
        username: 'owner',
        password: PASSWORD,
        role: Role.PLATFORM_OWNER,
      });
      const c = client();
      for (let i = 0; i < 3; i++) {
        const start = (
          await c.request('POST', '/auth/login', { username: 'owner', password: PASSWORD })
        ).body as { challenge: string };
        await c.request('POST', '/auth/login/mfa', { challenge: start.challenge, code: '000000' });
      }
      expect(await t.prisma.securityEvent.count({ where: { type: 'MFA_FAILED' } })).toBe(1);
    });

    it('note l’invitation d’un super admin dans le journal du propriétaire', async () => {
      await createUser(t.prisma, {
        username: 'owner',
        password: PASSWORD,
        role: Role.PLATFORM_OWNER,
      });
      const c = client();
      await c.login('owner', PASSWORD);
      await c.request('POST', '/creator-invitations', { platoUsername: 'Karim_77' });
      const types = ((await c.request('GET', '/auth/activity')).body as Event[]).map((e) => e.type);
      expect(types).toContain('CREATOR_INVITED');
    });

    it('purge les événements de plus de 30 jours, et eux seulement', async () => {
      const user = await alice();
      const old = new Date(Date.now() - SECURITY_EVENT_TTL_MS - 3_600_000);
      await t.prisma.securityEvent.createMany({
        data: [
          { userId: user.id, type: 'LOGIN_OK', createdAt: old },
          { userId: user.id, type: 'LOGIN_OK' },
        ],
      });
      const security = t.app.get((await import('./security.service')).SecurityService);
      expect(await security.purge()).toBe(1);
      expect(await t.prisma.securityEvent.count()).toBe(1);
    });

    it('supprimer le compte supprime son journal', async () => {
      const user = await alice();
      const c = client();
      await c.login('alice', PASSWORD);
      await t.prisma.user.delete({ where: { id: user.id } });
      expect(await t.prisma.securityEvent.count()).toBe(0);
    });
  });

  describe('mot de passe du propriétaire', () => {
    it('le changement exige 16 caractères et refuse son identifiant, pas pour un autre compte', async () => {
      await createUser(t.prisma, {
        username: 'owner',
        password: PASSWORD,
        role: Role.PLATFORM_OWNER,
      });
      await alice();
      const owner = client();
      await owner.login('owner', PASSWORD);
      const change = (c: Client, newPassword: string) =>
        c.request('POST', '/auth/change-password', { currentPassword: PASSWORD, newPassword });
      expect((await change(owner, 'court-mais-12c')).status).toBe(400);
      const withName = await change(owner, 'mon-owner-est-long-123');
      expect(withName.status).toBe(400);
      expect(JSON.stringify(withName.body)).toContain('identifiant');
      expect((await change(owner, randomPassword() + 'abcd')).status).toBe(204);

      // Un compte ordinaire garde la règle de 12 caractères.
      const other = client();
      await other.login('alice', PASSWORD);
      expect((await change(other, 'douze-chars!')).status).toBe(204);
    });
  });
});
