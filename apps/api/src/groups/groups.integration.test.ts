/**
 * Tests d'intégration des groupes, des invitations d'admins et, surtout, de l'ACCÈS CROISÉ
 * (risque R1) : un compte d'un groupe ne voit, ne modifie et ne devine rien d'un autre groupe.
 * Même fonctionnement que les tests d'authentification : vraie API, vraie base `…_test`.
 */
import { GroupRole, Role } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from '../auth/crypto';
import { MAX_GROUPS_PER_CREATOR } from './groups.service';
import {
  Client,
  createUser,
  randomPassword,
  resetDatabase,
  startApp,
  testDatabaseUrl,
  type TestApp,
  WEB_ORIGIN,
} from '../auth/test-harness';

if (!testDatabaseUrl) {
  console.warn('⚠ TEST_DATABASE_URL absent : les tests d’intégration des groupes sont ignorés.');
}

// Mot de passe de test tiré au hasard : rien d'écrit en dur dans le dépôt.
const PASSWORD = randomPassword();

interface Created {
  group: { id: string; name: string };
  invitation: {
    id: string;
    token: string;
    url: string;
    groupRole: string | null;
    groupId: string | null;
  };
}

describe.skipIf(!testDatabaseUrl)('groupes et accès croisé (base réelle)', () => {
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

  const loggedIn = async (username: string) => {
    const c = client();
    expect((await c.login(username, PASSWORD)).status).toBe(200);
    return c;
  };

  /** Crée un compte membre d'un groupe, directement en base. */
  async function member(username: string, groupId: string, role: GroupRole) {
    const user = await createUser(t.prisma, { username, password: PASSWORD, role: Role.MEMBER });
    await t.prisma.groupMember.create({ data: { groupId, userId: user.id, role } });
    return user;
  }

  /**
   * Deux groupes, chacun avec un super admin et un admin :
   *   A : alice (super admin), adam (admin)      B : bob (super admin), barbara (admin)
   * plus le propriétaire de la plateforme.
   */
  async function world() {
    await createUser(t.prisma, {
      username: 'owner',
      password: PASSWORD,
      role: Role.PLATFORM_OWNER,
    });
    const a = await t.prisma.group.create({ data: { name: 'Groupe A' } });
    const b = await t.prisma.group.create({ data: { name: 'Groupe B' } });
    await member('alice', a.id, GroupRole.SUPER_ADMIN);
    await member('adam', a.id, GroupRole.ADMIN);
    await member('bob', b.id, GroupRole.SUPER_ADMIN);
    const barbara = await member('barbara', b.id, GroupRole.ADMIN);
    return { a, b, barbara };
  }

  // -----------------------------------------------------------------------------------------
  describe('super admins : invités par le propriétaire, seuls à créer des groupes', () => {
    const owner = () =>
      createUser(t.prisma, { username: 'owner', password: PASSWORD, role: Role.PLATFORM_OWNER });
    const creator = (username = 'chef') =>
      createUser(t.prisma, { username, password: PASSWORD, role: Role.GROUP_CREATOR });

    it('le propriétaire invite un super admin : lien sans groupe, jeton stocké haché', async () => {
      await owner();
      const c = await loggedIn('owner');
      const reply = await c.request('POST', '/creator-invitations');
      expect(reply.status).toBe(201);
      const inv = reply.body as Created['invitation'];
      expect(inv).toMatchObject({ groupId: null, groupRole: null });
      expect(inv.url).toBe(`${WEB_ORIGIN}/invitation/${inv.token}`);
      const row = await t.prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } });
      expect(row.tokenHash).toBe(sha256(inv.token));

      const list = await c.request('GET', '/creator-invitations');
      expect(list.body).toEqual([expect.objectContaining({ id: inv.id })]);
      expect(JSON.stringify(list.body)).not.toContain(inv.token);
      expect((await c.request('DELETE', `/creator-invitations/${inv.id}`)).status).toBe(200);
      expect((await c.request('DELETE', `/creator-invitations/${inv.id}`)).status).toBe(404);
    });

    it('seul le propriétaire invite des super admins', async () => {
      await world();
      await creator();
      for (const user of ['alice', 'adam', 'chef']) {
        const c = await loggedIn(user);
        expect((await c.request('POST', '/creator-invitations')).status).toBe(403);
        expect((await c.request('GET', '/creator-invitations')).status).toBe(403);
      }
      expect((await client().request('POST', '/creator-invitations')).status).toBe(401);
      expect(await t.prisma.invitation.count()).toBe(0);
    });

    it('le propriétaire n’annule pas, par cette route, l’invitation d’un groupe', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const inv = (await alice.request('POST', `/groups/${a.id}/invitations`, {})).body as {
        id: string;
      };
      const owner = await loggedIn('owner');
      expect((await owner.request('DELETE', `/creator-invitations/${inv.id}`)).status).toBe(404);
      expect(await t.prisma.invitation.count({ where: { id: inv.id } })).toBe(1);
    });

    it('accepter le lien crée un super admin, sans groupe ni appartenance', async () => {
      await owner();
      const inv = (await (await loggedIn('owner')).request('POST', '/creator-invitations'))
        .body as Created['invitation'];
      const chef = client();
      const accept = await chef.request('POST', '/invitations/accept', {
        token: inv.token,
        username: 'chef',
        password: PASSWORD,
        platoUsername: 'Chef_Plato',
      });
      expect(accept.status).toBe(201);
      expect(accept.body).toMatchObject({ user: { username: 'chef', role: 'GROUP_CREATOR' } });
      chef.csrfToken = (accept.body as { csrfToken: string }).csrfToken;
      expect((await chef.request('GET', '/groups')).body).toEqual([]);
      expect(await t.prisma.groupMember.count()).toBe(0);
      // Le lien ne sert qu'une fois.
      expect(
        (
          await client().request('POST', '/invitations/accept', {
            token: inv.token,
            username: 'autre',
            password: PASSWORD,
            platoUsername: 'Autre',
          })
        ).status,
      ).toBe(400);
    });

    it('un compte membre qui utilise le lien (join) devient super admin', async () => {
      const { a } = await world();
      const inv = (await (await loggedIn('owner')).request('POST', '/creator-invitations'))
        .body as Created['invitation'];
      const alice = await loggedIn('alice');
      const joined = await alice.request('POST', '/invitations/join', { token: inv.token });
      expect(joined.status).toBe(200);
      expect(joined.body).toEqual({ groupId: null });
      const user = await t.prisma.user.findUniqueOrThrow({ where: { username: 'alice' } });
      expect(user.role).toBe('GROUP_CREATOR');
      // Ses appartenances restent celles qu'elle avait.
      expect(await t.prisma.groupMember.count({ where: { userId: user.id, groupId: a.id } })).toBe(
        1,
      );
    });

    it('« join » refuse un super admin ou le propriétaire, sans consommer le lien', async () => {
      await owner();
      await creator();
      const inv = (await (await loggedIn('owner')).request('POST', '/creator-invitations'))
        .body as Created['invitation'];
      for (const user of ['chef', 'owner']) {
        const c = await loggedIn(user);
        expect((await c.request('POST', '/invitations/join', { token: inv.token })).status).toBe(
          409,
        );
      }
      const row = await t.prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } });
      expect(row.usedAt).toBeNull();
    });

    it('un super admin crée un groupe et en devient le super admin, lui seul', async () => {
      await world(); // deux autres groupes qui ne doivent pas bouger
      await creator();
      const chef = await loggedIn('chef');
      const reply = await chef.request('POST', '/groups', { name: '  Les Cracks  ' });
      expect(reply.status).toBe(201);
      const { group } = reply.body as Created;
      expect(group.name).toBe('Les Cracks');

      const mine = (await chef.request('GET', '/groups')).body as { id: string; myRole: string }[];
      expect(mine).toEqual([expect.objectContaining({ id: group.id, myRole: 'SUPER_ADMIN' })]);
      expect(await t.prisma.group.count()).toBe(3);
      // Il invite ensuite ses admins, mais jamais un autre super admin de groupe.
      expect((await chef.request('POST', `/groups/${group.id}/invitations`, {})).status).toBe(201);
    });

    it('un super admin peut avoir plusieurs groupes, dans la limite du plafond', async () => {
      const chef = await creator();
      const c = await loggedIn('chef');
      for (let i = 1; i <= MAX_GROUPS_PER_CREATOR; i++) {
        expect((await c.request('POST', '/groups', { name: `Groupe ${i}` })).status).toBe(201);
      }
      expect((await c.request('POST', '/groups', { name: 'De trop' })).status).toBe(409);
      expect(await t.prisma.groupMember.count({ where: { userId: chef.id } })).toBe(
        MAX_GROUPS_PER_CREATOR,
      );
    });

    it('des créations simultanées ne dépassent pas le plafond', async () => {
      const chef = await creator();
      const c = await loggedIn('chef');
      const replies = await Promise.all(
        Array.from({ length: MAX_GROUPS_PER_CREATOR + 3 }, (_, i) =>
          c.request('POST', '/groups', { name: `Groupe ${i}` }),
        ),
      );
      expect(replies.filter((r) => r.status === 201)).toHaveLength(MAX_GROUPS_PER_CREATOR);
      expect(await t.prisma.groupMember.count({ where: { userId: chef.id } })).toBe(
        MAX_GROUPS_PER_CREATOR,
      );
    });

    it('ni le propriétaire, ni un admin, ni un compte sans groupe ne créent de groupe', async () => {
      await world();
      await createUser(t.prisma, { username: 'seul', password: PASSWORD, role: Role.MEMBER });
      for (const user of ['owner', 'alice', 'adam', 'seul']) {
        const c = await loggedIn(user);
        expect((await c.request('POST', '/groups', { name: 'Pirate' })).status).toBe(403);
      }
      expect((await client().request('POST', '/groups', { name: 'Pirate' })).status).toBe(401);
      expect(await t.prisma.group.count()).toBe(2);
    });

    it('valide le nom du groupe', async () => {
      await creator();
      const c = await loggedIn('chef');
      for (const name of ['', 'a', 'x'.repeat(61), 'a\nb', 42]) {
        expect((await c.request('POST', '/groups', { name })).status).toBe(400);
      }
      expect(await t.prisma.group.count()).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('ACCÈS CROISÉ : un groupe ne touche pas à un autre', () => {
    it('ne liste que les groupes dont on est membre', async () => {
      const { a, b } = await world();
      const names = async (user: string) =>
        ((await (await loggedIn(user)).request('GET', '/groups')).body as { name: string }[]).map(
          (g) => g.name,
        );
      expect(await names('alice')).toEqual([a.name]);
      expect(await names('adam')).toEqual([a.name]);
      expect(await names('bob')).toEqual([b.name]);
      expect(await names('owner')).toEqual([a.name, b.name]); // l'assistance voit tout
    });

    it.each(['alice', 'adam'])(
      '%s ne lit pas le groupe B : 404, identique à un groupe qui n’existe pas',
      async (user) => {
        const { b } = await world();
        const c = await loggedIn(user);
        const other = await c.request('GET', `/groups/${b.id}`);
        const missing = await c.request('GET', '/groups/00000000-0000-4000-8000-000000000000');
        const malformed = await c.request('GET', '/groups/pas-un-uuid');
        expect(other.status).toBe(404);
        expect(other.body).toEqual(missing.body);
        expect(other.body).toEqual(malformed.body);
        expect(JSON.stringify(other.body)).not.toContain('Groupe B');
      },
    );

    it('alice ne peut rien faire dans le groupe B : invitations, membres', async () => {
      const { b, barbara } = await world();
      const alice = await loggedIn('alice');

      expect((await alice.request('POST', `/groups/${b.id}/invitations`, {})).status).toBe(404);
      expect((await alice.request('GET', `/groups/${b.id}/invitations`)).status).toBe(404);
      expect((await alice.request('DELETE', `/groups/${b.id}/members/${barbara.id}`)).status).toBe(
        404,
      );
      // Rien n'a bougé dans B.
      expect(await t.prisma.groupMember.count({ where: { groupId: b.id } })).toBe(2);
      expect(await t.prisma.invitation.count({ where: { groupId: b.id } })).toBe(0);
    });

    it('alice ne peut pas retirer un membre de B en passant par son propre groupe', async () => {
      const { a, barbara } = await world();
      const alice = await loggedIn('alice');
      // Elle vise le groupe A (le sien) mais l'identifiant d'un membre de B.
      const reply = await alice.request('DELETE', `/groups/${a.id}/members/${barbara.id}`);
      expect(reply.status).toBe(404);
      expect(await t.prisma.groupMember.count({ where: { userId: barbara.id } })).toBe(1);
    });

    it('une invitation du groupe A ne s’annule pas depuis le groupe B, ni l’inverse', async () => {
      const { a, b } = await world();
      const alice = await loggedIn('alice');
      const bob = await loggedIn('bob');
      const inv = (await alice.request('POST', `/groups/${a.id}/invitations`, {})).body as {
        id: string;
      };

      expect((await bob.request('DELETE', `/groups/${b.id}/invitations/${inv.id}`)).status).toBe(
        404,
      );
      expect((await bob.request('DELETE', `/groups/${a.id}/invitations/${inv.id}`)).status).toBe(
        404,
      );
      expect(await t.prisma.invitation.count({ where: { id: inv.id } })).toBe(1);
      expect((await alice.request('DELETE', `/groups/${a.id}/invitations/${inv.id}`)).status).toBe(
        200,
      );
    });

    it('sans connexion, tout est refusé', async () => {
      const { a } = await world();
      const anonymous = client();
      for (const [method, path] of [
        ['GET', '/groups'],
        ['GET', `/groups/${a.id}`],
        ['POST', `/groups/${a.id}/invitations`],
        ['GET', `/groups/${a.id}/invitations`],
      ] as const) {
        expect(
          (await anonymous.request(method, path, method === 'POST' ? {} : undefined)).status,
        ).toBe(401);
      }
    });

    it('un membre retiré perd l’accès tout de suite, sans se reconnecter', async () => {
      const { a } = await world();
      const adam = await loggedIn('adam');
      expect((await adam.request('GET', `/groups/${a.id}`)).status).toBe(200);

      const alice = await loggedIn('alice');
      const adamUser = await t.prisma.user.findUniqueOrThrow({ where: { username: 'adam' } });
      expect((await alice.request('DELETE', `/groups/${a.id}/members/${adamUser.id}`)).status).toBe(
        204,
      );

      expect((await adam.request('GET', `/groups/${a.id}`)).status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('rôles dans le groupe', () => {
    it('un admin voit son groupe et ses membres, mais n’invite ni ne retire personne', async () => {
      const { a } = await world();
      const adam = await loggedIn('adam');

      const detail = await adam.request('GET', `/groups/${a.id}`);
      expect(detail.status).toBe(200);
      expect(detail.body).toMatchObject({
        name: 'Groupe A',
        myRole: 'ADMIN',
        members: [
          { username: 'alice', role: 'SUPER_ADMIN' },
          { username: 'adam', role: 'ADMIN' },
        ],
      });
      expect(JSON.stringify(detail.body)).not.toMatch(/passwordHash|argon2/);

      expect((await adam.request('POST', `/groups/${a.id}/invitations`, {})).status).toBe(403);
      expect((await adam.request('GET', `/groups/${a.id}/invitations`)).status).toBe(403);
      const alice = await t.prisma.user.findUniqueOrThrow({ where: { username: 'alice' } });
      expect((await adam.request('DELETE', `/groups/${a.id}/members/${alice.id}`)).status).toBe(
        403,
      );
    });

    it('le super admin invite des admins, jamais un autre super admin', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');

      const ok = await alice.request('POST', `/groups/${a.id}/invitations`, {});
      expect(ok.status).toBe(201);
      expect(ok.body).toMatchObject({ groupRole: 'ADMIN', groupId: a.id });

      for (const body of [{ groupRole: 'SUPER_ADMIN' }, { groupRole: 'PLATFORM_OWNER' }]) {
        const refused = await alice.request('POST', `/groups/${a.id}/invitations`, body);
        expect([400, 403]).toContain(refused.status);
      }
      expect(await t.prisma.invitation.count({ where: { groupId: a.id } })).toBe(1);
    });

    it('le propriétaire peut réinviter un super admin dans n’importe quel groupe', async () => {
      const { a } = await world();
      const owner = await loggedIn('owner');
      const reply = await owner.request('POST', `/groups/${a.id}/invitations`, {
        groupRole: 'SUPER_ADMIN',
      });
      expect(reply.status).toBe(201);
      expect(reply.body).toMatchObject({ groupRole: 'SUPER_ADMIN', groupId: a.id });
      expect(
        (
          await owner.request(
            'POST',
            '/groups/00000000-0000-4000-8000-000000000000/invitations',
            {},
          )
        ).status,
      ).toBe(404);
    });

    it('un super admin ne se retire pas du groupe ; un admin se retire', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const aliceUser = await t.prisma.user.findUniqueOrThrow({ where: { username: 'alice' } });
      const adamUser = await t.prisma.user.findUniqueOrThrow({ where: { username: 'adam' } });

      expect(
        (await alice.request('DELETE', `/groups/${a.id}/members/${aliceUser.id}`)).status,
      ).toBe(409);
      expect((await alice.request('DELETE', `/groups/${a.id}/members/${adamUser.id}`)).status).toBe(
        204,
      );
      expect((await alice.request('DELETE', `/groups/${a.id}/members/${adamUser.id}`)).status).toBe(
        404,
      );
      expect(await t.prisma.groupMember.count({ where: { groupId: a.id } })).toBe(1);
    });

    it('un simple compte sans groupe n’a accès à aucun groupe', async () => {
      const { a } = await world();
      await createUser(t.prisma, { username: 'seul', password: PASSWORD, role: Role.MEMBER });
      const c = await loggedIn('seul');
      expect((await c.request('GET', '/groups')).body).toEqual([]);
      expect((await c.request('GET', `/groups/${a.id}`)).status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('invitations d’admins', () => {
    const accept = (token: string, overrides: Record<string, unknown> = {}) =>
      client().request('POST', '/invitations/accept', {
        token,
        username: 'recrue',
        password: PASSWORD,
        platoUsername: 'Recrue_Plato',
        ...overrides,
      });

    async function adminInvitation(groupId: string) {
      const alice = await loggedIn('alice');
      const reply = await alice.request('POST', `/groups/${groupId}/invitations`, {});
      expect(reply.status).toBe(201);
      return { alice, inv: reply.body as Created['invitation'] };
    }

    it('crée un compte admin du bon groupe uniquement, et consomme l’invitation', async () => {
      const { a, b } = await world();
      const { inv } = await adminInvitation(a.id);
      const reply = await accept(inv.token);
      expect(reply.status).toBe(201);

      const user = await t.prisma.user.findUniqueOrThrow({
        where: { username: 'recrue' },
        include: { memberships: true },
      });
      expect(user.role).toBe('MEMBER');
      expect(user.memberships).toEqual([
        expect.objectContaining({ groupId: a.id, role: GroupRole.ADMIN }),
      ]);
      expect(user.memberships.some((m) => m.groupId === b.id)).toBe(false);

      const row = await t.prisma.invitation.findUniqueOrThrow({ where: { id: inv.id } });
      expect(row.usedById).toBe(user.id);
    });

    it('ne se réutilise pas ; deux utilisations simultanées donnent un seul compte', async () => {
      const { a } = await world();
      const { inv } = await adminInvitation(a.id);
      const [x, y] = await Promise.all([
        accept(inv.token, { username: 'premier' }),
        accept(inv.token, { username: 'second' }),
      ]);
      expect([x.status, y.status].sort()).toEqual([201, 400]);
      expect((await accept(inv.token, { username: 'troisieme' })).status).toBe(400);
      expect(await t.prisma.groupMember.count({ where: { groupId: a.id } })).toBe(3);
    });

    it('refuse un jeton inconnu, expiré ou annulé avec le même message', async () => {
      const { a } = await world();
      const { alice, inv: expired } = await adminInvitation(a.id);
      await t.prisma.invitation.update({
        where: { id: expired.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      const revoked = (await alice.request('POST', `/groups/${a.id}/invitations`, {}))
        .body as Created['invitation'];
      expect(
        (await alice.request('DELETE', `/groups/${a.id}/invitations/${revoked.id}`)).status,
      ).toBe(200);

      const replies = [
        await accept('x'.repeat(43)),
        await accept(expired.token),
        await accept(revoked.token),
      ];
      for (const r of replies) expect(r.status).toBe(400);
      expect(new Set(replies.map((r) => JSON.stringify(r.body))).size).toBe(1);
    });

    it('un identifiant déjà pris donne 409 sans consommer l’invitation', async () => {
      const { a } = await world();
      const { inv } = await adminInvitation(a.id);
      expect((await accept(inv.token, { username: 'alice' })).status).toBe(409);
      expect((await accept(inv.token, { username: 'libre' })).status).toBe(201);
    });

    it('liste les invitations en attente sans jamais montrer les jetons', async () => {
      const { a } = await world();
      const { alice, inv } = await adminInvitation(a.id);
      const list = await alice.request('GET', `/groups/${a.id}/invitations`);
      expect(list.body).toEqual([expect.objectContaining({ id: inv.id, groupRole: 'ADMIN' })]);
      expect(JSON.stringify(list.body)).not.toContain(inv.token);
    });

    it('un compte existant rejoint un second groupe avec « join », sans doublon', async () => {
      const { a, b } = await world();
      const { inv } = await adminInvitation(a.id);
      // bob, super admin de B, est invité comme admin de A.
      const bob = await loggedIn('bob');
      const joined = await bob.request('POST', '/invitations/join', { token: inv.token });
      expect(joined.status).toBe(200);
      expect(joined.body).toEqual({ groupId: a.id });

      const mine = (await bob.request('GET', '/groups')).body as { id: string; myRole: string }[];
      expect(mine).toHaveLength(2);
      expect(mine.find((g) => g.id === a.id)?.myRole).toBe('ADMIN');
      expect(mine.find((g) => g.id === b.id)?.myRole).toBe('SUPER_ADMIN');

      // Rôle par groupe : être admin de A ne donne aucun pouvoir de super admin sur A.
      expect((await bob.request('POST', `/groups/${a.id}/invitations`, {})).status).toBe(403);
    });

    it('« join » refuse un membre déjà dans le groupe, sans consommer l’invitation', async () => {
      const { a } = await world();
      const { inv } = await adminInvitation(a.id);
      const adam = await loggedIn('adam');
      expect((await adam.request('POST', '/invitations/join', { token: inv.token })).status).toBe(
        409,
      );
      expect((await accept(inv.token)).status).toBe(201);
      expect(
        (await client().request('POST', '/invitations/join', { token: inv.token })).status,
      ).toBe(401);
    });
  });
});
