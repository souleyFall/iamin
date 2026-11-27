/**
 * Tableau de bord du propriétaire : vraie API, vraie base `…_test`. On vérifie surtout ce qu'il ne
 * donne pas : aucune écriture, aucun pseudo de joueur, aucun accès pour les autres rôles.
 */
import { GroupRole, Role } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  Client,
  createUser,
  randomPassword,
  resetDatabase,
  startApp,
  testDatabaseUrl,
  type TestApp,
} from '../auth/test-harness';

if (!testDatabaseUrl) {
  console.warn(
    '⚠ TEST_DATABASE_URL absent : les tests d’intégration de la vue d’ensemble sont ignorés.',
  );
}

const PASSWORD = randomPassword();

interface Summary {
  accounts: { total: number; superAdmins: number; admins: number };
  active: { online: number; week: number; month: number };
  tournaments: Record<string, number>;
  registrations: {
    total: number;
    accepted: number;
    waitlist: number;
    pending: number;
    players: number;
  };
  groups: {
    id: string;
    name: string;
    superAdmins: { username: string }[];
    admins: { username: string }[];
    tournaments: { total: number; running: number; finished: number };
    registrations: number;
  }[];
  people: { username: string; kind: string; lastActiveAt: string | null }[];
}
interface Listing {
  total: number;
  nextBefore: string | null;
  tournaments: {
    id: string;
    name: string;
    status: string;
    format: string;
    group: { name: string };
    holder: string | null;
    counts: { accepted: number; waitlist: number; pending: number };
  }[];
}

describe.skipIf(!testDatabaseUrl)('vue d’ensemble du propriétaire (base réelle)', () => {
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

  /** Deux groupes, un super admin, un admin, un compte jamais venu, trois tournois. */
  async function world() {
    await createUser(t.prisma, {
      username: 'owner',
      password: PASSWORD,
      role: Role.PLATFORM_OWNER,
    });
    const boss = await createUser(t.prisma, {
      username: 'boss',
      password: PASSWORD,
      role: Role.GROUP_CREATOR,
    });
    const adam = await createUser(t.prisma, {
      username: 'adam',
      password: PASSWORD,
      role: Role.MEMBER,
    });
    await createUser(t.prisma, { username: 'fantome', password: PASSWORD, role: Role.MEMBER });
    const a = await t.prisma.group.create({ data: { name: 'Alpha' } });
    const b = await t.prisma.group.create({ data: { name: 'Bravo' } });
    await t.prisma.groupMember.createMany({
      data: [
        { groupId: a.id, userId: boss.id, role: GroupRole.SUPER_ADMIN },
        { groupId: a.id, userId: adam.id, role: GroupRole.ADMIN },
        { groupId: b.id, userId: boss.id, role: GroupRole.SUPER_ADMIN },
      ],
    });
    const tournament = (groupId: string, name: string, status: string, format = 'ELIMINATION') =>
      t.prisma.tournament.create({
        data: {
          groupId,
          name,
          format: format as 'ELIMINATION' | 'LEAGUE',
          status: status as 'REGISTRATION',
          capacity: 8,
          publicSlug: `slug-${name.replace(/\W/g, '')}-0123456789`,
          holderId: boss.id,
        },
      });
    const open = await tournament(a.id, 'Coupe ouverte', 'REGISTRATION');
    const running = await tournament(a.id, 'Coupe en cours', 'STARTED', 'LEAGUE');
    await tournament(b.id, 'Coupe finie', 'FINISHED');
    const reg = (tournamentId: string, name: string, status: string) =>
      t.prisma.registration.create({
        data: {
          tournamentId,
          platoName: name,
          platoKey: name.toLowerCase(),
          status: status as 'ACCEPTED',
        },
      });
    await reg(open.id, 'SecretJoueur', 'ACCEPTED');
    await reg(open.id, 'Attente', 'WAITLIST');
    await reg(open.id, 'AValider', 'PENDING');
    await reg(running.id, 'secretjoueur', 'ACCEPTED'); // le même joueur, ailleurs
    await reg(running.id, 'Parti', 'REPLACED'); // ne compte plus
    return { a, b, boss, adam, open };
  }

  it('compte les groupes, les admins, les tournois par état et les inscrits', async () => {
    await world();
    const owner = await loggedIn('owner');
    const reply = await owner.request('GET', '/overview');
    expect(reply.status).toBe(200);
    const s = reply.body as Summary;
    expect(s.accounts).toEqual({ total: 3, superAdmins: 1, admins: 1 });
    expect(s.tournaments).toEqual({
      total: 3,
      REGISTRATION: 1,
      CHECK_IN: 0,
      STARTED: 1,
      FINISHED: 1,
    });
    expect(s.registrations).toEqual({
      total: 4,
      accepted: 2,
      waitlist: 1,
      pending: 1,
      players: 3,
    });
    expect(s.groups.map((g) => g.name)).toEqual(['Alpha', 'Bravo']);
    expect(s.groups[0]).toMatchObject({
      superAdmins: [{ username: 'boss' }],
      admins: [{ username: 'adam' }],
      tournaments: { total: 2, running: 1, finished: 0 },
      registrations: 4,
    });
    expect(Object.fromEntries(s.people.map((p) => [p.username, p.kind]))).toEqual({
      adam: 'ADMIN',
      boss: 'SUPER_ADMIN',
      fantome: 'NONE',
    });
  });

  it('mesure l’activité des comptes (en ligne, 7 jours, 30 jours), sans le propriétaire', async () => {
    const { adam } = await world();
    const owner = await loggedIn('owner');
    // boss se connecte maintenant ; adam s'est connecté il y a 12 jours ; « fantome » jamais.
    await loggedIn('boss');
    await t.prisma.securityEvent.create({
      data: {
        userId: adam.id,
        type: 'LOGIN_OK',
        createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
      },
    });
    const s = (await owner.request('GET', '/overview')).body as Summary;
    expect(s.active).toEqual({ online: 1, week: 1, month: 2 });
    const seen = Object.fromEntries(s.people.map((p) => [p.username, p.lastActiveAt !== null]));
    expect(seen).toEqual({ adam: true, boss: true, fantome: false });
  });

  it('filtre les tournois par état, format, groupe et nom', async () => {
    const { b } = await world();
    const owner = await loggedIn('owner');
    const list = async (query: string) =>
      (await owner.request('GET', `/overview/tournaments${query}`)).body as Listing;

    expect((await list('')).total).toBe(3);
    expect((await list('?status=FINISHED')).tournaments.map((x) => x.name)).toEqual([
      'Coupe finie',
    ]);
    expect((await list('?status=STARTED')).tournaments.map((x) => x.name)).toEqual([
      'Coupe en cours',
    ]);
    expect((await list('?format=LEAGUE')).total).toBe(1);
    expect((await list(`?groupId=${b.id}`)).tournaments[0]?.group.name).toBe('Bravo');
    expect((await list('?q=OUVERTE')).total).toBe(1);
    const open = (await list('?status=REGISTRATION')).tournaments[0];
    expect(open).toMatchObject({
      holder: 'boss',
      counts: { accepted: 1, waitlist: 1, pending: 1 },
    });
  });

  it('pagine par 50 sans doublon, et refuse un curseur ou un filtre inconnu', async () => {
    const { a } = await world();
    await t.prisma.tournament.createMany({
      data: Array.from({ length: 55 }, (_, i) => ({
        groupId: a.id,
        name: `Série ${i}`,
        format: 'ELIMINATION' as const,
        capacity: 4,
        publicSlug: `serie-${i}-0123456789abcd`,
      })),
    });
    const owner = await loggedIn('owner');
    const first = (await owner.request('GET', '/overview/tournaments')).body as Listing;
    expect(first.total).toBe(58);
    expect(first.tournaments).toHaveLength(50);
    const second = (
      await owner.request('GET', `/overview/tournaments?before=${first.nextBefore ?? ''}`)
    ).body as Listing;
    expect(second.tournaments).toHaveLength(8);
    expect(second.nextBefore).toBeNull();
    const ids = [...first.tournaments, ...second.tournaments].map((x) => x.id);
    expect(new Set(ids).size).toBe(58);

    for (const query of [
      '?before=00000000-0000-4000-8000-000000000000',
      '?status=PERDU',
      '?groupId=pas-un-uuid',
      '?inconnu=1',
    ]) {
      expect((await owner.request('GET', `/overview/tournaments${query}`)).status, query).toBe(400);
    }
  });

  it('ne montre ni pseudo de joueur, ni lien public, ni mot de passe', async () => {
    await world();
    const owner = await loggedIn('owner');
    const text = JSON.stringify([
      (await owner.request('GET', '/overview')).body,
      (await owner.request('GET', '/overview/tournaments')).body,
    ]);
    expect(text).not.toMatch(/SecretJoueur|AValider|Attente|slug-|passwordHash|totpSecret/i);
  });

  it('refuse tout autre rôle, et le propriétaire n’a toujours pas accès aux tournois eux-mêmes', async () => {
    const { a, open } = await world();
    const anonymous = client();
    expect((await anonymous.request('GET', '/overview')).status).toBe(401);
    for (const username of ['boss', 'adam', 'fantome']) {
      const c = await loggedIn(username);
      expect((await c.request('GET', '/overview')).status, username).toBe(403);
      expect((await c.request('GET', '/overview/tournaments')).status, username).toBe(403);
    }
    const owner = await loggedIn('owner');
    const direct = await owner.request('GET', `/groups/${a.id}/tournaments/${open.id}`);
    expect(direct.status).toBe(404);
    // Et rien ne s'écrit par la vue d'ensemble.
    expect((await owner.request('POST', '/overview', {})).status).toBe(404);
    expect((await owner.request('DELETE', `/overview/tournaments/${open.id}`)).status).toBe(404);
    expect(await t.prisma.tournament.count()).toBe(3);
  });
});
