/**
 * Tests d'intégration : une vraie API contre une vraie base PostgreSQL (`TEST_DATABASE_URL`,
 * base dont le nom finit par `_test`). Ils tournent en CI ; en local, lance la base avec
 * `docker compose up -d`, crée `iamin_test`, applique les migrations et définis TEST_DATABASE_URL
 * (voir README). Sans cette variable, ils sont ignorés et le dire est affiché.
 */
import { randomBytes } from 'node:crypto';
import { Role } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from './crypto';
import {
  Client,
  createUser,
  resetDatabase,
  startApp,
  testDatabaseUrl,
  type TestApp,
  WEB_ORIGIN,
} from './test-harness';

if (!testDatabaseUrl) {
  console.warn(
    '⚠ TEST_DATABASE_URL absent : les tests d’intégration de l’authentification sont ignorés.',
  );
}

// Valeurs de test tirées au hasard à chaque exécution : aucun mot de passe écrit en dur dans le
// dépôt (les détecteurs de secrets ne peuvent pas distinguer un exemple d'un vrai mot de passe).
const randomPassword = () => `pw-${randomBytes(12).toString('hex')}`;
const PASSWORD = randomPassword();
const NEW_PASSWORD = randomPassword();
/** 6 caractères : sous le minimum de 12. */
const shortPassword = randomBytes(3).toString('hex');

describe.skipIf(!testDatabaseUrl)('authentification (base réelle)', () => {
  let t: TestApp;
  const client = (origin?: string) => new Client(t.url, origin);

  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  async function owner() {
    return createUser(t.prisma, {
      username: 'owner',
      password: PASSWORD,
      role: Role.PLATFORM_OWNER,
    });
  }
  async function loggedIn(username: string) {
    const c = client();
    const reply = await c.login(username, PASSWORD);
    expect(reply.status).toBe(200);
    return c;
  }

  // -----------------------------------------------------------------------------------------
  describe('connexion et sessions', () => {
    it('ouvre une session : cookie httpOnly, jeton CSRF, aucun secret dans la réponse', async () => {
      await owner();
      const c = client();
      const reply = await c.login('Owner', PASSWORD); // l'identifiant est insensible à la casse
      expect(reply.status).toBe(200);
      expect(reply.body).toMatchObject({ user: { username: 'owner', role: 'PLATFORM_OWNER' } });
      expect(JSON.stringify(reply.body)).not.toMatch(/passwordHash|argon2/);

      const cookie = reply.setCookies[0] ?? '';
      expect(cookie).toMatch(/^iamin_session=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Lax/i);
      expect(cookie).toMatch(/Path=\//);
      expect(cookie).not.toMatch(/Domain=/i);
    });

    it('ne stocke jamais le jeton de session en clair : seule son empreinte est en base', async () => {
      await owner();
      const c = client();
      await c.login('owner', PASSWORD);
      const token = (c.cookie ?? '').split('=')[1] ?? '';
      const rows = await t.prisma.session.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tokenHash).toBe(sha256(token));
      expect(JSON.stringify(rows)).not.toContain(token);
    });

    it('donne un jeton neuf à chaque connexion (pas de fixation de session)', async () => {
      await owner();
      const a = client();
      const b = client();
      await a.login('owner', PASSWORD);
      await b.login('owner', PASSWORD);
      expect(a.cookie).not.toBe(b.cookie);
      expect(a.csrfToken).not.toBe(b.csrfToken);
    });

    it('répond pareil pour un compte inconnu et pour un mauvais mot de passe', async () => {
      await owner();
      const unknown = await client().login('personne', PASSWORD);
      const wrong = await client().login('owner', randomPassword());
      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(unknown.body).toEqual(wrong.body);
      expect(unknown.setCookies).toHaveLength(0);
    });

    it('refuse /auth/me sans session, l’accepte avec', async () => {
      await owner();
      expect((await client().request('GET', '/auth/me')).status).toBe(401);
      const c = await loggedIn('owner');
      const me = await c.request('GET', '/auth/me');
      expect(me.status).toBe(200);
      expect(me.body).toMatchObject({ user: { username: 'owner' }, csrfToken: c.csrfToken });
    });

    it('refuse une session expirée et la supprime', async () => {
      await owner();
      const c = await loggedIn('owner');
      await t.prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await c.request('GET', '/auth/me')).status).toBe(401);
      expect(await t.prisma.session.count()).toBe(0);
    });

    it('ferme la session à la déconnexion (CSRF exigé)', async () => {
      await owner();
      const c = await loggedIn('owner');
      expect((await c.request('POST', '/auth/logout', undefined, { csrf: false })).status).toBe(
        403,
      );
      expect((await c.request('GET', '/auth/me')).status).toBe(200);

      const out = await c.request('POST', '/auth/logout');
      expect(out.status).toBe(204);
      expect(out.setCookies[0]).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(await t.prisma.session.count()).toBe(0);
    });

    it('bloque un compte après 10 échecs, même avec le bon mot de passe ensuite', async () => {
      // Compte dédié : le verrouillage est gardé en mémoire par l'API pour toute la durée du
      // fichier de tests, il ne doit pas gêner les autres tests.
      await createUser(t.prisma, { username: 'cible', password: PASSWORD, role: Role.ADMIN });
      for (let i = 0; i < 10; i++) {
        expect((await client().login('cible', `mauvais ${i}`)).status).toBe(401);
      }
      expect((await client().login('cible', PASSWORD)).status).toBe(429);
      expect((await client().login('owner', randomPassword())).status).toBe(401); // autre compte : libre
    });

    it('limite les tentatives par adresse IP (429) hors mode test', async () => {
      const limited = await startApp({ nodeEnv: 'development' });
      try {
        const c = new Client(limited.url);
        const statuses: number[] = [];
        for (let i = 0; i < 12; i++) statuses.push((await c.login('personne', 'x')).status);
        expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
        expect(statuses.slice(10)).toEqual([429, 429]);
      } finally {
        await limited.close();
      }
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('CSRF, origine et rôles', () => {
    it('refuse une écriture authentifiée sans jeton CSRF, ou avec un faux', async () => {
      await owner();
      const c = await loggedIn('owner');
      const body = { currentPassword: PASSWORD, newPassword: NEW_PASSWORD };

      expect((await c.request('POST', '/auth/change-password', body, { csrf: false })).status).toBe(
        403,
      );
      c.csrfToken = 'faux-jeton';
      expect((await c.request('POST', '/auth/change-password', body)).status).toBe(403);
      // Le mot de passe n'a pas changé.
      expect((await client().login('owner', PASSWORD)).status).toBe(200);
    });

    it('refuse toute écriture venant d’une autre origine, même publique', async () => {
      await owner();
      const evil = new Client(t.url, 'https://evil.example');
      const reply = await evil.login('owner', PASSWORD);
      expect(reply.status).toBe(403);
      expect(reply.setCookies).toHaveLength(0);
    });

    it('accepte une écriture sans en-tête Origin (client hors navigateur)', async () => {
      await owner();
      expect((await new Client(t.url, undefined).login('owner', PASSWORD)).status).toBe(200);
    });

    it('réserve les invitations et les tickets au propriétaire', async () => {
      await createUser(t.prisma, {
        username: 'chef',
        password: PASSWORD,
        role: Role.GROUP_SUPER_ADMIN,
      });
      await createUser(t.prisma, { username: 'adm', password: PASSWORD, role: Role.ADMIN });
      const anonymous = client();
      expect((await anonymous.request('POST', '/invitations', {})).status).toBe(401);
      expect((await anonymous.request('GET', '/reset-tickets')).status).toBe(401);

      for (const username of ['chef', 'adm']) {
        const c = await loggedIn(username);
        expect((await c.request('POST', '/invitations', {})).status).toBe(403);
        expect((await c.request('GET', '/invitations')).status).toBe(403);
        expect((await c.request('GET', '/reset-tickets')).status).toBe(403);
      }
    });

    it('la sonde /health reste publique', async () => {
      expect((await client().request('GET', '/health')).status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('changement de mot de passe', () => {
    it('exige le mot de passe actuel et un nouveau mot de passe assez long', async () => {
      await owner();
      const c = await loggedIn('owner');
      const wrong = await c.request('POST', '/auth/change-password', {
        currentPassword: randomPassword(),
        newPassword: NEW_PASSWORD,
      });
      expect(wrong.status).toBe(400);
      const short = await c.request('POST', '/auth/change-password', {
        currentPassword: PASSWORD,
        newPassword: shortPassword,
      });
      expect(short.status).toBe(400);
      expect(JSON.stringify(short.body)).not.toContain(shortPassword);
    });

    it('change le mot de passe, ferme les autres sessions et garde la session en cours', async () => {
      await owner();
      const here = await loggedIn('owner');
      const elsewhere = await loggedIn('owner');

      const reply = await here.request('POST', '/auth/change-password', {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      });
      expect(reply.status).toBe(204);

      expect((await here.request('GET', '/auth/me')).status).toBe(200);
      expect((await elsewhere.request('GET', '/auth/me')).status).toBe(401);
      expect((await client().login('owner', PASSWORD)).status).toBe(401);
      expect((await client().login('owner', NEW_PASSWORD)).status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('invitations', () => {
    async function invite(c: Client) {
      const reply = await c.request('POST', '/invitations', {});
      expect(reply.status).toBe(201);
      return reply.body as { id: string; token: string; url: string; role: string };
    }
    const accept = (token: string, overrides: Record<string, unknown> = {}) =>
      client().request('POST', '/invitations/accept', {
        token,
        username: 'nouveau',
        password: PASSWORD,
        platoUsername: 'Nouveau_Plato',
        ...overrides,
      });

    it('le propriétaire crée une invitation ; le jeton n’est stocké que haché', async () => {
      await owner();
      const c = await loggedIn('owner');
      const inv = await invite(c);
      expect(inv.role).toBe('GROUP_SUPER_ADMIN');
      expect(inv.url).toBe(`${WEB_ORIGIN}/invitation/${inv.token}`);

      const row = await t.prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } });
      expect(row.tokenHash).toBe(sha256(inv.token));
      expect(JSON.stringify(row)).not.toContain(inv.token);

      const list = await c.request('GET', '/invitations');
      expect(list.body).toHaveLength(1);
      expect(JSON.stringify(list.body)).not.toContain(inv.token);
    });

    it('refuse d’inviter un autre rôle que créateur de groupe', async () => {
      await owner();
      const c = await loggedIn('owner');
      for (const role of ['PLATFORM_OWNER', 'ADMIN']) {
        expect((await c.request('POST', '/invitations', { role })).status).toBe(400);
      }
    });

    it('crée le compte, ouvre la session et consomme l’invitation', async () => {
      await owner();
      const inv = await invite(await loggedIn('owner'));
      const reply = await accept(inv.token);
      expect(reply.status).toBe(201);
      expect(reply.body).toMatchObject({
        user: { username: 'nouveau', role: 'GROUP_SUPER_ADMIN', platoUsername: 'Nouveau_Plato' },
      });
      expect(reply.setCookies[0]).toMatch(/^iamin_session=/);

      const user = await t.prisma.user.findUniqueOrThrow({ where: { username: 'nouveau' } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      const row = await t.prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } });
      expect(row.usedAt).not.toBeNull();
      expect(row.usedById).toBe(user.id);
    });

    it('ne se réutilise pas', async () => {
      await owner();
      const inv = await invite(await loggedIn('owner'));
      expect((await accept(inv.token)).status).toBe(201);
      expect((await accept(inv.token, { username: 'autre' })).status).toBe(400);
      expect(await t.prisma.user.count({ where: { role: Role.GROUP_SUPER_ADMIN } })).toBe(1);
    });

    it('refuse un jeton inconnu, expiré ou annulé avec le même message', async () => {
      await owner();
      const c = await loggedIn('owner');
      const unknown = await accept('x'.repeat(43));

      const expired = await invite(c);
      await t.prisma.invitation.update({
        where: { id: expired.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const revoked = await invite(c);
      expect((await c.request('DELETE', `/invitations/${revoked.id}`)).status).toBe(200);

      const replies = [unknown, await accept(expired.token), await accept(revoked.token)];
      for (const r of replies) expect(r.status).toBe(400);
      expect(new Set(replies.map((r) => JSON.stringify(r.body))).size).toBe(1);
      expect(await t.prisma.user.count()).toBe(1); // le propriétaire seul
    });

    it('deux personnes qui utilisent le lien en même temps : un seul compte', async () => {
      await owner();
      const inv = await invite(await loggedIn('owner'));
      const [a, b] = await Promise.all([
        accept(inv.token, { username: 'premier' }),
        accept(inv.token, { username: 'second' }),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, 400]);
      expect(await t.prisma.user.count({ where: { role: Role.GROUP_SUPER_ADMIN } })).toBe(1);
    });

    it('un identifiant déjà pris donne 409 sans consommer l’invitation', async () => {
      await owner();
      const inv = await invite(await loggedIn('owner'));
      expect((await accept(inv.token, { username: 'owner' })).status).toBe(409);
      expect((await accept(inv.token, { username: 'libre' })).status).toBe(201);
    });

    it('valide les champs sans jamais renvoyer le mot de passe reçu', async () => {
      await owner();
      const inv = await invite(await loggedIn('owner'));
      const reply = await accept(inv.token, { password: shortPassword, platoUsername: 'a\nb' });
      expect(reply.status).toBe(400);
      expect(JSON.stringify(reply.body)).not.toContain(shortPassword);
      expect(await t.prisma.user.count()).toBe(1);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('tickets de réinitialisation', () => {
    async function setup() {
      await owner();
      const user = await createUser(t.prisma, {
        username: 'chef',
        password: PASSWORD,
        role: Role.GROUP_SUPER_ADMIN,
        platoUsername: 'Chef_Plato',
      });
      return { user, ownerClient: await loggedIn('owner') };
    }
    const requestReset = (username: string) =>
      client().request('POST', '/auth/reset-requests', { username });

    it('répond pareil que le compte existe ou non, et ne crée un ticket que s’il existe', async () => {
      await setup();
      const known = await requestReset('chef');
      const unknown = await requestReset('inconnu');
      expect(known.status).toBe(202);
      expect(unknown.status).toBe(202);
      expect(known.body).toEqual(unknown.body);
      expect(await t.prisma.resetTicket.count()).toBe(1);
    });

    it('ne crée pas de ticket pour le propriétaire, ni de doublon', async () => {
      await setup();
      await requestReset('owner');
      expect(await t.prisma.resetTicket.count()).toBe(0);
      await requestReset('chef');
      await requestReset('CHEF');
      expect(await t.prisma.resetTicket.count()).toBe(1);
    });

    it('le propriétaire voit le ticket avec le pseudo Plato pour vérifier l’identité', async () => {
      const { ownerClient } = await setup();
      await requestReset('chef');
      const list = await ownerClient.request('GET', '/reset-tickets');
      expect(list.body).toMatchObject([
        { status: 'OPEN', user: { username: 'chef', platoUsername: 'Chef_Plato' } },
      ]);
    });

    it('cycle complet : demande, émission, nouveau mot de passe, sessions fermées', async () => {
      const { ownerClient } = await setup();
      const victim = await loggedIn('chef'); // une session ouverte à fermer
      await requestReset('chef');
      const [ticket] = (await ownerClient.request('GET', '/reset-tickets')).body as {
        id: string;
      }[];

      const issued = await ownerClient.request('POST', `/reset-tickets/${ticket?.id}/issue`);
      expect(issued.status).toBe(201);
      const { token, url } = issued.body as { token: string; url: string };
      expect(url).toBe(`${WEB_ORIGIN}/reinitialisation/${token}`);
      const row = await t.prisma.resetTicket.findUniqueOrThrow({ where: { id: ticket?.id } });
      expect(row.tokenHash).toBe(sha256(token));
      expect(JSON.stringify(row)).not.toContain(token);

      const reset = await client().request('POST', '/auth/reset', {
        token,
        newPassword: NEW_PASSWORD,
      });
      expect(reset.status).toBe(204);
      expect((await victim.request('GET', '/auth/me')).status).toBe(401);
      expect((await client().login('chef', PASSWORD)).status).toBe(401);
      expect((await client().login('chef', NEW_PASSWORD)).status).toBe(200);

      const after = await t.prisma.resetTicket.findUniqueOrThrow({ where: { id: ticket?.id } });
      expect(after.status).toBe('USED');
      expect(after.tokenHash).toBeNull();
    });

    it('le jeton ne sert qu’une fois, même en cas de requêtes simultanées', async () => {
      const { ownerClient } = await setup();
      await requestReset('chef');
      const [ticket] = (await ownerClient.request('GET', '/reset-tickets')).body as {
        id: string;
      }[];
      const { token } = (await ownerClient.request('POST', `/reset-tickets/${ticket?.id}/issue`))
        .body as { token: string };

      const body = (newPassword: string) => ({ token, newPassword });
      const replies = await Promise.all([
        client().request('POST', '/auth/reset', body(randomPassword())),
        client().request('POST', '/auth/reset', body(randomPassword())),
      ]);
      expect(replies.map((r) => r.status).sort()).toEqual([204, 400]);
      expect((await client().request('POST', '/auth/reset', body(NEW_PASSWORD))).status).toBe(400);
    });

    it('refuse un jeton expiré, inconnu ou jamais émis, avec le même message', async () => {
      const { ownerClient } = await setup();
      await requestReset('chef');
      const [ticket] = (await ownerClient.request('GET', '/reset-tickets')).body as {
        id: string;
      }[];
      const { token } = (await ownerClient.request('POST', `/reset-tickets/${ticket?.id}/issue`))
        .body as { token: string };
      await t.prisma.resetTicket.update({
        where: { id: ticket?.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const replies = await Promise.all(
        [token, 'y'.repeat(43)].map((tk) =>
          client().request('POST', '/auth/reset', { token: tk, newPassword: NEW_PASSWORD }),
        ),
      );
      for (const r of replies) expect(r.status).toBe(400);
      expect(new Set(replies.map((r) => JSON.stringify(r.body))).size).toBe(1);
      expect((await client().login('chef', PASSWORD)).status).toBe(200); // inchangé
    });

    it('émettre à nouveau remplace le jeton précédent', async () => {
      const { ownerClient } = await setup();
      await requestReset('chef');
      const [ticket] = (await ownerClient.request('GET', '/reset-tickets')).body as {
        id: string;
      }[];
      const first = (await ownerClient.request('POST', `/reset-tickets/${ticket?.id}/issue`))
        .body as { token: string };
      const second = (await ownerClient.request('POST', `/reset-tickets/${ticket?.id}/issue`))
        .body as { token: string };

      const old = await client().request('POST', '/auth/reset', {
        token: first.token,
        newPassword: NEW_PASSWORD,
      });
      expect(old.status).toBe(400);
      const fresh = await client().request('POST', '/auth/reset', {
        token: second.token,
        newPassword: NEW_PASSWORD,
      });
      expect(fresh.status).toBe(204);
    });

    it('le propriétaire peut clore un ticket : son jeton cesse de fonctionner', async () => {
      const { ownerClient } = await setup();
      await requestReset('chef');
      const [ticket] = (await ownerClient.request('GET', '/reset-tickets')).body as {
        id: string;
      }[];
      const { token } = (await ownerClient.request('POST', `/reset-tickets/${ticket?.id}/issue`))
        .body as { token: string };

      expect((await ownerClient.request('POST', `/reset-tickets/${ticket?.id}/close`)).status).toBe(
        204,
      );
      expect((await ownerClient.request('POST', `/reset-tickets/${ticket?.id}/close`)).status).toBe(
        409,
      );
      expect((await ownerClient.request('POST', `/reset-tickets/${ticket?.id}/issue`)).status).toBe(
        409,
      );
      const reply = await client().request('POST', '/auth/reset', {
        token,
        newPassword: NEW_PASSWORD,
      });
      expect(reply.status).toBe(400);
    });

    it('répond 404 pour un ticket inconnu et 400 pour un identifiant mal formé', async () => {
      const { ownerClient } = await setup();
      const unknownId = '00000000-0000-4000-8000-000000000000';
      expect((await ownerClient.request('POST', `/reset-tickets/${unknownId}/issue`)).status).toBe(
        404,
      );
      expect((await ownerClient.request('POST', '/reset-tickets/pas-un-uuid/issue')).status).toBe(
        400,
      );
    });
  });
});
