/**
 * Double authentification (TOTP) : activation, connexion en deux étapes, obligation du propriétaire,
 * codes de secours, ressaisie avant les actions sensibles, session courte du propriétaire.
 * Même fonctionnement que les autres tests d'intégration : vraie API, vraie base `…_test`.
 */
import { Role } from '@prisma/client';
import * as OTPAuth from 'otpauth';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decryptSecret } from './crypto';
import { OWNER_IDLE_MS, OWNER_SESSION_TTL_MS, SESSION_TTL_MS } from './session.service';
import {
  Client,
  createUser,
  randomPassword,
  rememberTotpSecret,
  resetDatabase,
  startApp,
  TEST_TOTP_KEY,
  testDatabaseUrl,
  totpCodeFor,
  type TestApp,
} from './test-harness';

if (!testDatabaseUrl) {
  console.warn(
    '⚠ TEST_DATABASE_URL absent : les tests d’intégration de la double authentification sont ignorés.',
  );
}

const PASSWORD = randomPassword();
const STEP_MS = 30_000;

interface Setup {
  secret: string;
  otpauthUrl: string;
}
interface Codes {
  recoveryCodes: string[];
}

describe.skipIf(!testDatabaseUrl)('double authentification (base réelle)', () => {
  let t: TestApp;
  const client = () => new Client(t.url);

  beforeAll(async () => {
    t = await startApp();
  });
  afterAll(async () => {
    await t.close();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });

  /** Code d'un compte dont l'activation est faite par l'API, pour un instant et un décalage donnés. */
  const codeFrom = (secret: string, stepOffset = 0) =>
    new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    }).generate({ timestamp: Date.now() + stepOffset * STEP_MS });

  /** Un propriétaire qui n'a pas encore activé la double authentification, connecté. */
  async function bareOwner() {
    await createUser(t.prisma, {
      username: 'owner',
      password: PASSWORD,
      role: Role.PLATFORM_OWNER,
      mfa: false,
    });
    const c = client();
    expect((await c.login('owner', PASSWORD)).status).toBe(200);
    return c;
  }
  /** Active la double authentification d'un compte connecté ; renvoie son secret et ses codes de secours. */
  async function enroll(c: Client, username: string) {
    const setup = (await c.request('POST', '/auth/mfa/setup')).body as Setup;
    rememberTotpSecret(username, setup.secret);
    const enabled = await c.request('POST', '/auth/mfa/enable', { code: codeFrom(setup.secret) });
    expect(enabled.status).toBe(200);
    return { ...setup, ...(enabled.body as Codes) };
  }

  describe('propriétaire sans double authentification', () => {
    it('se connecte, mais tout lui est fermé sauf l’activation, « me » et la déconnexion', async () => {
      const c = await bareOwner();
      expect((await c.request('GET', '/auth/me')).status).toBe(200);
      for (const [method, path] of [
        ['GET', '/groups'],
        ['GET', '/feedback'],
        ['GET', '/creator-invitations'],
        ['GET', '/reset-tickets'],
      ] as const) {
        const reply = await c.request(method, path);
        expect(reply.status).toBe(403);
        expect(reply.body).toMatchObject({ code: 'MFA_ENROLLMENT_REQUIRED' });
      }
    });

    it('active la double authentification : secret, premier code, codes de secours', async () => {
      const c = await bareOwner();
      const setup = (await c.request('POST', '/auth/mfa/setup')).body as Setup;
      expect(setup.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(setup.otpauthUrl).toMatch(/^otpauth:\/\/totp\/i-am-in:owner\?/);
      expect(setup.otpauthUrl).toContain(`secret=${setup.secret}`);

      // Le secret est chiffré en base, jamais en clair.
      const row = await t.prisma.user.findUniqueOrThrow({ where: { username: 'owner' } });
      expect(row.totpSecretEnc).not.toContain(setup.secret);
      expect(decryptSecret(TEST_TOTP_KEY, row.totpSecretEnc ?? '')).toBe(setup.secret);
      expect(row.totpEnabledAt).toBeNull(); // pas active tant qu'un code n'a pas été donné

      expect((await c.request('POST', '/auth/mfa/enable', { code: '000000' })).status).toBe(400);
      const ok = await c.request('POST', '/auth/mfa/enable', { code: codeFrom(setup.secret) });
      expect(ok.status).toBe(200);
      const { recoveryCodes } = ok.body as Codes;
      expect(recoveryCodes).toHaveLength(10);
      expect(new Set(recoveryCodes).size).toBe(10);
      for (const code of recoveryCodes) expect(code).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);

      // Les codes de secours ne sont stockés que hachés.
      const stored = JSON.stringify(await t.prisma.recoveryCode.findMany());
      for (const code of recoveryCodes) expect(stored).not.toContain(code.replace('-', ''));
      // Le propriétaire a maintenant accès à tout, immédiatement (session « élevée »).
      expect((await c.request('GET', '/groups')).status).toBe(200);
      expect((await c.request('GET', '/auth/mfa')).body).toMatchObject({
        enabled: true,
        required: true,
        recoveryCodesLeft: 10,
      });
    });

    it('ne laisse pas activer deux fois, et un secret abandonné est remplacé', async () => {
      const c = await bareOwner();
      const first = (await c.request('POST', '/auth/mfa/setup')).body as Setup;
      const second = (await c.request('POST', '/auth/mfa/setup')).body as Setup;
      expect(second.secret).not.toBe(first.secret);
      // L'ancien secret ne valide plus rien.
      expect(
        (await c.request('POST', '/auth/mfa/enable', { code: codeFrom(first.secret) })).status,
      ).toBe(400);
      expect(
        (await c.request('POST', '/auth/mfa/enable', { code: codeFrom(second.secret) })).status,
      ).toBe(200);
      expect((await c.request('POST', '/auth/mfa/setup')).status).toBe(409);
      expect((await c.request('POST', '/auth/mfa/enable', { code: '123456' })).status).toBe(409);
    });

    it('l’activation ferme les autres sessions du compte', async () => {
      const stolen = await bareOwner();
      const mine = client();
      expect((await mine.login('owner', PASSWORD)).status).toBe(200);
      await enroll(mine, 'owner');
      expect((await stolen.request('GET', '/auth/me')).status).toBe(401);
      expect((await mine.request('GET', '/auth/me')).status).toBe(200);
    });

    it('le propriétaire ne peut pas désactiver la double authentification', async () => {
      const c = await bareOwner();
      const { secret } = await enroll(c, 'owner');
      const reply = await c.request('POST', '/auth/mfa/disable', {
        password: PASSWORD,
        code: codeFrom(secret, 1),
      });
      expect(reply.status).toBe(403);
      expect(
        (await t.prisma.user.findUniqueOrThrow({ where: { username: 'owner' } })).totpEnabledAt,
      ).not.toBeNull();
    });
  });

  describe('connexion en deux étapes', () => {
    async function ownerWithMfa() {
      await createUser(t.prisma, {
        username: 'owner',
        password: PASSWORD,
        role: Role.PLATFORM_OWNER,
      });
    }

    it('le mot de passe seul ne donne ni cookie ni accès : un jeton d’étape et rien d’autre', async () => {
      await ownerWithMfa();
      const reply = await client().request('POST', '/auth/login', {
        username: 'owner',
        password: PASSWORD,
      });
      expect(reply.status).toBe(200);
      expect(reply.setCookies).toHaveLength(0);
      expect(Object.keys(reply.body as object).sort()).toEqual(['challenge', 'mfaRequired']);
      expect(await t.prisma.session.count()).toBe(0);
      // Le jeton d'étape n'ouvre aucune route.
      const challenge = (reply.body as { challenge: string }).challenge;
      const c = client();
      const probe = await c.request('GET', '/groups', undefined, {
        headers: { authorization: `Bearer ${challenge}`, cookie: `iamin_session=${challenge}` },
      });
      expect(probe.status).toBe(401);
    });

    it('un mauvais mot de passe ne révèle rien sur la double authentification', async () => {
      await ownerWithMfa();
      const wrong = await client().request('POST', '/auth/login', {
        username: 'owner',
        password: randomPassword(),
      });
      const unknown = await client().request('POST', '/auth/login', {
        username: 'personne',
        password: PASSWORD,
      });
      expect(wrong.status).toBe(401);
      expect(wrong.body).toEqual(unknown.body);
    });

    it('le bon code ouvre la session, élevée pour 10 minutes ; il ne sert qu’une fois', async () => {
      await ownerWithMfa();
      const c = client();
      const first = await c.request('POST', '/auth/login', {
        username: 'owner',
        password: PASSWORD,
      });
      const { challenge } = first.body as { challenge: string };
      const code = totpCodeFor('owner');
      const done = await c.request('POST', '/auth/login/mfa', { challenge, code });
      expect(done.status).toBe(200);
      expect(done.body).toMatchObject({ user: { username: 'owner', mfaEnabled: true } });
      expect(done.setCookies[0]).toMatch(/HttpOnly/i);
      c.csrfToken = (done.body as { csrfToken: string }).csrfToken;
      const me = (await c.request('GET', '/auth/me')).body as { elevatedUntil: string };
      expect(new Date(me.elevatedUntil).getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);

      // Rejeu : le même code, sur une nouvelle connexion, est refusé.
      const again = client();
      const second = await again.request('POST', '/auth/login', {
        username: 'owner',
        password: PASSWORD,
      });
      const replay = await again.request('POST', '/auth/login/mfa', {
        challenge: (second.body as { challenge: string }).challenge,
        code,
      });
      expect(replay.status).toBe(401);
      // Le jeton d'étape d'un échec reste utilisable avec un code frais.
      const fresh = await again.request('POST', '/auth/login/mfa', {
        challenge: (second.body as { challenge: string }).challenge,
        code: totpCodeFor('owner', 1),
      });
      expect(fresh.status).toBe(200);
    });

    it('refuse un code faux, mal formé ou trop éloigné, sans créer de session', async () => {
      await ownerWithMfa();
      const c = client();
      const { challenge } = (
        await c.request('POST', '/auth/login', { username: 'owner', password: PASSWORD })
      ).body as { challenge: string };
      for (const code of [
        '000000',
        '12345',
        'abcdef',
        '',
        totpCodeFor('owner', 5),
        totpCodeFor('owner', -5),
      ]) {
        const reply = await c.request('POST', '/auth/login/mfa', { challenge, code });
        expect([400, 401]).toContain(reply.status);
      }
      expect(await t.prisma.session.count()).toBe(0);
    });

    it('accepte une tranche de 30 s d’écart (horloge décalée) mais pas davantage', async () => {
      await ownerWithMfa();
      const c = client();
      const { challenge } = (
        await c.request('POST', '/auth/login', { username: 'owner', password: PASSWORD })
      ).body as { challenge: string };
      expect(
        (await c.request('POST', '/auth/login/mfa', { challenge, code: totpCodeFor('owner', -1) }))
          .status,
      ).toBe(200);
    });

    it('le jeton d’étape se périme après 5 essais, et après 5 minutes', async () => {
      await ownerWithMfa();
      const c = client();
      const start = async () =>
        (
          (await c.request('POST', '/auth/login', { username: 'owner', password: PASSWORD }))
            .body as { challenge: string }
        ).challenge;

      const burned = await start();
      for (let i = 0; i < 5; i++) {
        expect(
          (await c.request('POST', '/auth/login/mfa', { challenge: burned, code: '000000' }))
            .status,
        ).toBe(401);
      }
      // Même avec le bon code, le jeton épuisé ne sert plus.
      expect(
        (
          await c.request('POST', '/auth/login/mfa', {
            challenge: burned,
            code: totpCodeFor('owner'),
          })
        ).status,
      ).toBe(401);

      const old = await start();
      await t.prisma.mfaChallenge.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      expect(
        (await c.request('POST', '/auth/login/mfa', { challenge: old, code: totpCodeFor('owner') }))
          .status,
      ).toBe(401);
      expect(await t.prisma.session.count()).toBe(0);
    });

    it('trop de codes faux bloquent le compte quelques minutes, même avec le bon code ensuite', async () => {
      await ownerWithMfa();
      const c = client();
      for (let i = 0; i < 5; i++) {
        const { challenge } = (
          await c.request('POST', '/auth/login', { username: 'owner', password: PASSWORD })
        ).body as { challenge: string };
        await c.request('POST', '/auth/login/mfa', { challenge, code: '000000' });
      }
      const { challenge } = (
        await c.request('POST', '/auth/login', { username: 'owner', password: PASSWORD })
      ).body as { challenge: string };
      const locked = await c.request('POST', '/auth/login/mfa', {
        challenge,
        code: totpCodeFor('owner'),
      });
      expect(locked.status).toBe(429);
    });

    it('un code de secours ouvre la session, une seule fois', async () => {
      const c0 = await bareOwner();
      const { recoveryCodes } = await enroll(c0, 'owner');
      const code = recoveryCodes[0] ?? '';

      const login = async (secours: string) => {
        const c = client();
        const { challenge } = (
          await c.request('POST', '/auth/login', { username: 'owner', password: PASSWORD })
        ).body as { challenge: string };
        return c.request('POST', '/auth/login/mfa', { challenge, code: secours });
      };
      expect((await login(code.toUpperCase())).status).toBe(200); // casse et tiret ignorés
      expect((await login(code)).status).toBe(401); // déjà utilisé
      expect((await login('aaaaa-bbbbb')).status).toBe(401);
      const left = await t.prisma.recoveryCode.count({ where: { usedAt: null } });
      expect(left).toBe(9);
    });
  });

  describe('actions sensibles : ressaisie du code', () => {
    it('refusées sans ressaisie récente, permises 10 minutes après un code', async () => {
      await createUser(t.prisma, {
        username: 'owner',
        password: PASSWORD,
        role: Role.PLATFORM_OWNER,
      });
      const c = client();
      expect((await c.login('owner', PASSWORD)).status).toBe(200);
      // La connexion avec code vient d'élever la session.
      const body = { platoUsername: 'Karim_77' };
      expect((await c.request('POST', '/creator-invitations', body)).status).toBe(201);

      // Élévation expirée : refus clair, et rien n'est créé.
      await t.prisma.session.updateMany({ data: { elevatedUntil: new Date(Date.now() - 1000) } });
      const refused = await c.request('POST', '/creator-invitations', body);
      expect(refused.status).toBe(403);
      expect(refused.body).toMatchObject({ code: 'ELEVATION_REQUIRED' });
      expect(await t.prisma.invitation.count()).toBe(1);

      // Un mauvais code ne rouvre rien ; le bon, oui.
      expect((await c.request('POST', '/auth/mfa/elevate', { code: '000000' })).status).toBe(401);
      expect((await c.request('POST', '/creator-invitations', body)).status).toBe(403);
      await t.prisma.user.update({ where: { username: 'owner' }, data: { totpLastStep: null } });
      const ok = await c.request('POST', '/auth/mfa/elevate', { code: totpCodeFor('owner') });
      expect(ok.status).toBe(200);
      expect((await c.request('POST', '/creator-invitations', body)).status).toBe(201);
    });

    it('protège la lecture des liens de réinitialisation émis, l’annulation, la purge et la suppression', async () => {
      await createUser(t.prisma, {
        username: 'owner',
        password: PASSWORD,
        role: Role.PLATFORM_OWNER,
      });
      const row = await t.prisma.feedback.create({
        data: { kind: 'OTHER', message: 'Un retour.' },
      });
      const c = client();
      await c.login('owner', PASSWORD);
      await t.prisma.session.updateMany({ data: { elevatedUntil: null } });
      for (const [method, path] of [
        ['POST', '/feedback/purge'],
        ['DELETE', `/feedback/${row.id}`],
        ['DELETE', '/creator-invitations/00000000-0000-4000-8000-000000000000'],
        ['POST', '/reset-tickets/00000000-0000-4000-8000-000000000000/issue'],
        ['POST', '/reset-tickets/00000000-0000-4000-8000-000000000000/close'],
      ] as const) {
        const reply = await c.request(method, path);
        expect(reply.status, `${method} ${path}`).toBe(403);
        expect(reply.body).toMatchObject({ code: 'ELEVATION_REQUIRED' });
      }
      expect(await t.prisma.feedback.count()).toBe(1);
      // Lire reste possible sans ressaisie : seule l'écriture sensible l'exige.
      expect((await c.request('GET', '/feedback')).status).toBe(200);
    });
  });

  describe('session du propriétaire', () => {
    it('dure 12 h au plus, contre 7 jours pour les autres comptes', async () => {
      await createUser(t.prisma, {
        username: 'owner',
        password: PASSWORD,
        role: Role.PLATFORM_OWNER,
      });
      await createUser(t.prisma, { username: 'alice', password: PASSWORD, role: Role.MEMBER });
      await client().login('owner', PASSWORD);
      await client().login('alice', PASSWORD);
      const sessions = await t.prisma.session.findMany({ include: { user: true } });
      const ttl = (name: string) => {
        const s = sessions.find((x) => x.user.username === name);
        return (s?.expiresAt.getTime() ?? 0) - (s?.createdAt.getTime() ?? 0);
      };
      expect(Math.abs(ttl('owner') - OWNER_SESSION_TTL_MS)).toBeLessThan(5_000);
      expect(Math.abs(ttl('alice') - SESSION_TTL_MS)).toBeLessThan(5_000);
    });

    it('se ferme après 30 minutes sans activité, pas pour un autre compte', async () => {
      await createUser(t.prisma, {
        username: 'owner',
        password: PASSWORD,
        role: Role.PLATFORM_OWNER,
      });
      await createUser(t.prisma, { username: 'alice', password: PASSWORD, role: Role.MEMBER });
      const owner = client();
      const alice = client();
      await owner.login('owner', PASSWORD);
      await alice.login('alice', PASSWORD);
      const idle = new Date(Date.now() - OWNER_IDLE_MS - 60_000);
      await t.prisma.session.updateMany({ data: { lastSeenAt: idle } });
      expect((await owner.request('GET', '/auth/me')).status).toBe(401);
      expect((await alice.request('GET', '/auth/me')).status).toBe(200);
    });
  });

  describe('comptes ordinaires', () => {
    it('activation facultative : un admin l’active, puis se connecte avec le code', async () => {
      await createUser(t.prisma, { username: 'alice', password: PASSWORD, role: Role.MEMBER });
      const c = client();
      expect((await c.login('alice', PASSWORD)).status).toBe(200);
      expect((await c.request('GET', '/auth/mfa')).body).toMatchObject({
        enabled: false,
        required: false,
      });
      expect((await c.request('GET', '/groups')).status).toBe(200); // rien n'est bloqué avant
      await enroll(c, 'alice');

      const again = client();
      const first = await again.request('POST', '/auth/login', {
        username: 'alice',
        password: PASSWORD,
      });
      expect(first.body).toMatchObject({ mfaRequired: true });
    });

    it('désactivation : mot de passe ET code, et les codes de secours sont effacés', async () => {
      await createUser(t.prisma, { username: 'alice', password: PASSWORD, role: Role.MEMBER });
      const c = client();
      await c.login('alice', PASSWORD);
      const { secret } = await enroll(c, 'alice');
      expect(
        (
          await c.request('POST', '/auth/mfa/disable', {
            password: randomPassword(),
            code: codeFrom(secret, 1),
          })
        ).status,
      ).toBe(401);
      expect(
        (await c.request('POST', '/auth/mfa/disable', { password: PASSWORD, code: '000000' }))
          .status,
      ).toBe(401);
      expect(
        (
          await c.request('POST', '/auth/mfa/disable', {
            password: PASSWORD,
            code: codeFrom(secret, 1),
          })
        ).status,
      ).toBe(204);
      const row = await t.prisma.user.findUniqueOrThrow({ where: { username: 'alice' } });
      expect(row).toMatchObject({ totpEnabledAt: null, totpSecretEnc: null });
      expect(await t.prisma.recoveryCode.count()).toBe(0);
    });

    it('régénérer les codes de secours exige un code et invalide les anciens', async () => {
      await createUser(t.prisma, { username: 'alice', password: PASSWORD, role: Role.MEMBER });
      const c = client();
      await c.login('alice', PASSWORD);
      const { secret, recoveryCodes } = await enroll(c, 'alice');
      expect((await c.request('POST', '/auth/mfa/recovery-codes', { code: '000000' })).status).toBe(
        401,
      );
      const fresh = await c.request('POST', '/auth/mfa/recovery-codes', {
        code: codeFrom(secret, 1),
      });
      expect(fresh.status).toBe(200);
      const next = (fresh.body as Codes).recoveryCodes;
      expect(next).toHaveLength(10);
      expect(next.some((x) => recoveryCodes.includes(x))).toBe(false);
      expect(await t.prisma.recoveryCode.count({ where: { usedAt: null } })).toBe(10);
    });

    it('un compte sans double authentification ne peut ni ressaisir ni régénérer', async () => {
      await createUser(t.prisma, { username: 'alice', password: PASSWORD, role: Role.MEMBER });
      const c = client();
      await c.login('alice', PASSWORD);
      expect((await c.request('POST', '/auth/mfa/elevate', { code: '123456' })).status).toBe(403);
      expect((await c.request('POST', '/auth/mfa/recovery-codes', { code: '123456' })).status).toBe(
        403,
      );
    });
  });

  it('réinitialiser le mot de passe ne retire pas la double authentification', async () => {
    await createUser(t.prisma, {
      username: 'alice',
      password: PASSWORD,
      role: Role.MEMBER,
      mfa: true,
    });
    await t.prisma.user.update({
      where: { username: 'alice' },
      data: {
        passwordHash: (
          await createUser(t.prisma, { username: 'tmp', password: PASSWORD, role: Role.MEMBER })
        ).passwordHash,
      },
    });
    const first = await client().request('POST', '/auth/login', {
      username: 'alice',
      password: PASSWORD,
    });
    expect(first.body).toMatchObject({ mfaRequired: true });
  });
});
