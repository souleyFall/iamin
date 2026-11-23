/**
 * Tests d'intégration des tournois et des inscriptions : vraie API, vraie base `…_test`.
 * Au centre, l'ACCÈS CROISÉ (risque R1) : un groupe ne voit ni ne modifie les tournois d'un autre.
 */
import { GroupRole, Presence, RegistrationStatus, Role, TournamentStatus } from '@prisma/client';
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
import { MAX_PENDING } from './tournaments.service';

if (!testDatabaseUrl) {
  console.warn('⚠ TEST_DATABASE_URL absent : les tests d’intégration des tournois sont ignorés.');
}

// Mot de passe de test tiré au hasard : rien d'écrit en dur dans le dépôt.
const PASSWORD = randomPassword();

interface Tournament {
  id: string;
  name: string;
  capacity: number;
  status: string;
  language: string;
  publicSlug: string;
  registrations: { id: string; platoName: string; status: string; presence: string }[];
}
interface Registered {
  registration: { id: string; platoName: string; status: string };
  token: string;
}

describe.skipIf(!testDatabaseUrl)('tournois et inscriptions (base réelle)', () => {
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

  async function member(username: string, groupId: string, role: GroupRole) {
    const user = await createUser(t.prisma, { username, password: PASSWORD, role: Role.MEMBER });
    await t.prisma.groupMember.create({ data: { groupId, userId: user.id, role } });
    return user;
  }

  /** Groupe A : alice (super admin), adam (admin). Groupe B : bob (super admin). Et le propriétaire. */
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
    return { a, b };
  }

  const create = async (c: Client, groupId: string, body: Record<string, unknown> = {}) => {
    const reply = await c.request('POST', `/groups/${groupId}/tournaments`, {
      name: 'Coupe du week-end',
      format: 'ELIMINATION',
      capacity: 8,
      ...body,
    });
    expect(reply.status).toBe(201);
    return reply.body as Tournament;
  };
  const addPlayer = async (c: Client, groupId: string, tid: string, name: string) => {
    const reply = await c.request('POST', `/groups/${groupId}/tournaments/${tid}/registrations`, {
      name,
    });
    expect(reply.status).toBe(201);
    return reply.body as { id: string; status: string };
  };
  const detail = async (c: Client, groupId: string, tid: string) =>
    (await c.request('GET', `/groups/${groupId}/tournaments/${tid}`)).body as Tournament;
  const statuses = async (c: Client, groupId: string, tid: string) =>
    (await detail(c, groupId, tid)).registrations.map((r) => `${r.platoName}:${r.status}`);

  const publicRegister = (slug: string, name: string) =>
    client().request('POST', `/public/tournaments/${slug}/registrations`, { name });
  const mine = (token: string) =>
    client().request('GET', '/public/registration', undefined, {
      headers: { 'x-player-token': token },
    });

  // -----------------------------------------------------------------------------------------
  describe('création et réglages', () => {
    it('un admin crée un tournoi dans son groupe, avec un lien public aléatoire', async () => {
      const { a } = await world();
      const adam = await loggedIn('adam');
      const created = await create(adam, a.id, { name: '  Ligue d’automne  ', format: 'LEAGUE' });
      expect(created).toMatchObject({
        name: 'Ligue d’automne',
        capacity: 8,
        status: 'REGISTRATION',
      });
      expect(created.publicSlug).toMatch(/^[A-Za-z0-9_-]{22}$/);
      const other = await create(adam, a.id);
      expect(other.publicSlug).not.toBe(created.publicSlug);
    });

    it('valide les données', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const bad = [
        { name: '' },
        { name: 'a\nb' },
        { format: 'ROUND' },
        { capacity: 1 },
        { capacity: 257 },
        { capacity: 2.5 },
        { capacity: '8' },
      ];
      for (const override of bad) {
        const reply = await alice.request('POST', `/groups/${a.id}/tournaments`, {
          name: 'Valide',
          format: 'LEAGUE',
          capacity: 8,
          ...override,
        });
        expect(reply.status, JSON.stringify(override)).toBe(400);
      }
      expect(await t.prisma.tournament.count()).toBe(0);
    });

    it('on ne peut pas viser un autre groupe par le corps de la requête', async () => {
      const { a, b } = await world();
      const alice = await loggedIn('alice');
      const reply = await alice.request('POST', `/groups/${a.id}/tournaments`, {
        name: 'Piraté',
        format: 'LEAGUE',
        capacity: 4,
        groupId: b.id,
      });
      expect(reply.status).toBe(201);
      expect(await t.prisma.tournament.count({ where: { groupId: b.id } })).toBe(0);
      expect(await t.prisma.tournament.count({ where: { groupId: a.id } })).toBe(1);
    });

    it('modifie le nom, passe en pointage et revient, sans accepter d’autre statut', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id);
      const path = `/groups/${a.id}/tournaments/${tour.id}`;

      const renamed = await alice.request('PATCH', path, { name: 'Renommé', status: 'CHECK_IN' });
      expect(renamed.body).toMatchObject({ name: 'Renommé', status: 'CHECK_IN' });
      expect((await alice.request('PATCH', path, { status: 'REGISTRATION' })).status).toBe(200);
      expect((await alice.request('PATCH', path, { status: 'FINISHED' })).status).toBe(400);
      expect((await alice.request('PATCH', path, {})).status).toBe(400);
    });
    // Langue d'un tournoi : celle de la page des joueurs et du texte du chat (D27).
    it('un tournoi est en français par défaut ; l’admin choisit la langue à la création', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      expect((await create(alice, a.id)).language).toBe('fr');
      expect((await create(alice, a.id, { language: 'es' })).language).toBe('es');
      for (const language of ['de', 'FR', '', 3, null]) {
        const reply = await alice.request('POST', `/groups/${a.id}/tournaments`, {
          name: 'Valide',
          format: 'LEAGUE',
          capacity: 8,
          language,
        });
        expect(reply.status, JSON.stringify(language)).toBe(400);
      }
    });

    it('le détenteur change la langue, même après le tirage ; les autres admins non', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const adam = await loggedIn('adam');
      const tour = await create(alice, a.id, { format: 'LEAGUE', capacity: 4 });
      const path = `/groups/${a.id}/tournaments/${tour.id}`;
      expect((await alice.request('PATCH', path, { language: 'en' })).body).toMatchObject({
        language: 'en',
      });
      expect((await adam.request('PATCH', path, { language: 'es' })).status).toBe(403);
      expect((await alice.request('PATCH', path, { language: 'klingon' })).status).toBe(400);
      expect((await detail(alice, a.id, tour.id)).language).toBe('en');

      // La langue ne change que des textes : elle reste modifiable une fois le tirage fait.
      await t.prisma.tournament.update({
        where: { id: tour.id },
        data: { status: 'STARTED', drawnAt: new Date() },
      });
      expect((await alice.request('PATCH', path, { language: 'fr' })).status).toBe(200);
    });

    it('la page publique annonce la langue du tournoi, sans rien révéler d’autre', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id, { language: 'en' });
      const info = await client().request('GET', `/public/tournaments/${tour.publicSlug}`);
      expect(info.body).toMatchObject({ language: 'en' });
      const view = await client().request('GET', `/public/tournaments/${tour.publicSlug}/view`);
      expect(view.body).toMatchObject({ language: 'en' });
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('ACCÈS CROISÉ : un groupe ne touche pas aux tournois d’un autre', () => {
    it('ne liste que les tournois de son groupe', async () => {
      const { a, b } = await world();
      const alice = await loggedIn('alice');
      const bob = await loggedIn('bob');
      await create(alice, a.id, { name: 'Tournoi A' });
      await create(bob, b.id, { name: 'Tournoi B' });

      const names = async (c: Client, groupId: string) =>
        ((await c.request('GET', `/groups/${groupId}/tournaments`)).body as { name: string }[]).map(
          (x) => x.name,
        );
      expect(await names(alice, a.id)).toEqual(['Tournoi A']);
      expect(await names(bob, b.id)).toEqual(['Tournoi B']);
      // Viser le groupe voisin : 404, comme un groupe qui n'existe pas.
      expect((await alice.request('GET', `/groups/${b.id}/tournaments`)).status).toBe(404);
    });

    it('alice ne fait rien sur un tournoi du groupe B, par aucune route', async () => {
      const { a, b } = await world();
      const bob = await loggedIn('bob');
      const alice = await loggedIn('alice');
      const tourB = await create(bob, b.id);
      const player = await addPlayer(bob, b.id, tourB.id, 'JoueurB');

      // 1) En visant le groupe B directement : refusé par GroupGuard.
      const viaB = `/groups/${b.id}/tournaments/${tourB.id}`;
      expect((await alice.request('GET', viaB)).status).toBe(404);
      expect((await alice.request('PATCH', viaB, { name: 'Volé' })).status).toBe(404);
      expect(
        (await alice.request('POST', `${viaB}/registrations`, { name: 'Intrus' })).status,
      ).toBe(404);
      expect((await alice.request('DELETE', `${viaB}/registrations/${player.id}`)).status).toBe(
        404,
      );

      // 2) En passant par SON groupe avec l'identifiant d'un tournoi du groupe B : introuvable.
      const viaA = `/groups/${a.id}/tournaments/${tourB.id}`;
      expect((await alice.request('GET', viaA)).status).toBe(404);
      expect((await alice.request('PATCH', viaA, { name: 'Volé' })).status).toBe(404);
      expect(
        (await alice.request('POST', `${viaA}/registrations`, { name: 'Intrus' })).status,
      ).toBe(404);
      expect(
        (await alice.request('POST', `${viaA}/registrations/${player.id}/accept`)).status,
      ).toBe(404);
      expect(
        (
          await alice.request('PATCH', `${viaA}/registrations/${player.id}`, {
            presence: 'PRESENT',
          })
        ).status,
      ).toBe(404);
      expect((await alice.request('DELETE', `${viaA}/registrations/${player.id}`)).status).toBe(
        404,
      );

      // Rien n'a bougé.
      const row = await t.prisma.tournament.findUniqueOrThrow({ where: { id: tourB.id } });
      expect(row.name).toBe('Coupe du week-end');
      expect(await t.prisma.registration.count({ where: { tournamentId: tourB.id } })).toBe(1);
    });

    it('une inscription d’un autre tournoi du même groupe reste hors de portée', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const one = await create(alice, a.id);
      const two = await create(alice, a.id);
      const player = await addPlayer(alice, a.id, one.id, 'Joueur');
      const reply = await alice.request(
        'DELETE',
        `/groups/${a.id}/tournaments/${two.id}/registrations/${player.id}`,
      );
      expect(reply.status).toBe(404);
      expect(await t.prisma.registration.count()).toBe(1);
    });

    it('le propriétaire de la plateforme ne lit pas les tournois des groupes', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id);
      const owner = await loggedIn('owner');
      expect((await owner.request('GET', `/groups/${a.id}/tournaments`)).status).toBe(404);
      expect((await owner.request('GET', `/groups/${a.id}/tournaments/${tour.id}`)).status).toBe(
        404,
      );
      expect(
        (
          await owner.request('POST', `/groups/${a.id}/tournaments`, {
            name: 'Assistance',
            format: 'LEAGUE',
            capacity: 4,
          })
        ).status,
      ).toBe(404);
    });

    it('sans connexion, tout est refusé', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id);
      const anonymous = client();
      for (const [method, path] of [
        ['GET', `/groups/${a.id}/tournaments`],
        ['POST', `/groups/${a.id}/tournaments`],
        ['GET', `/groups/${a.id}/tournaments/${tour.id}`],
        ['PATCH', `/groups/${a.id}/tournaments/${tour.id}`],
        ['POST', `/groups/${a.id}/tournaments/${tour.id}/registrations`],
      ] as const) {
        const body = method === 'GET' ? undefined : {};
        expect((await anonymous.request(method, path, body)).status, `${method} ${path}`).toBe(401);
      }
    });

    it('un admin retiré du groupe perd l’accès à ses tournois tout de suite', async () => {
      const { a } = await world();
      const adam = await loggedIn('adam');
      const tour = await create(adam, a.id);
      const alice = await loggedIn('alice');
      const adamUser = await t.prisma.user.findUniqueOrThrow({ where: { username: 'adam' } });
      expect((await alice.request('DELETE', `/groups/${a.id}/members/${adamUser.id}`)).status).toBe(
        204,
      );
      expect((await adam.request('GET', `/groups/${a.id}/tournaments/${tour.id}`)).status).toBe(
        404,
      );
    });

    it('un admin et un super admin du même groupe voient les mêmes tournois', async () => {
      const { a } = await world();
      const adam = await loggedIn('adam');
      const alice = await loggedIn('alice');
      const tour = await create(adam, a.id);
      expect((await alice.request('GET', `/groups/${a.id}/tournaments/${tour.id}`)).status).toBe(
        200,
      );
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('places et liste d’attente', () => {
    it('remplit les places puis la liste d’attente, et promeut dans l’ordre quand une place se libère', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id, { capacity: 2 });
      const p1 = await addPlayer(alice, a.id, tour.id, 'Un');
      await addPlayer(alice, a.id, tour.id, 'Deux');
      const p3 = await addPlayer(alice, a.id, tour.id, 'Trois');
      await addPlayer(alice, a.id, tour.id, 'Quatre');
      expect(p1.status).toBe('ACCEPTED');
      expect(p3.status).toBe('WAITLIST');
      expect(await statuses(alice, a.id, tour.id)).toEqual([
        'Un:ACCEPTED',
        'Deux:ACCEPTED',
        'Trois:WAITLIST',
        'Quatre:WAITLIST',
      ]);

      const del = await alice.request(
        'DELETE',
        `/groups/${a.id}/tournaments/${tour.id}/registrations/${p1.id}`,
      );
      expect(del.status).toBe(204);
      expect(await statuses(alice, a.id, tour.id)).toEqual([
        'Deux:ACCEPTED',
        'Trois:ACCEPTED',
        'Quatre:WAITLIST',
      ]);
    });

    it('refuse de réduire les places sous le nombre de joueurs acceptés, et promeut si on les augmente', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id, { capacity: 2 });
      for (const name of ['Un', 'Deux', 'Trois']) await addPlayer(alice, a.id, tour.id, name);
      const path = `/groups/${a.id}/tournaments/${tour.id}`;

      expect((await alice.request('PATCH', path, { capacity: 3 })).status).toBe(200);
      expect(await statuses(alice, a.id, tour.id)).toEqual([
        'Un:ACCEPTED',
        'Deux:ACCEPTED',
        'Trois:ACCEPTED',
      ]);
      expect((await alice.request('PATCH', path, { capacity: 2 })).status).toBe(409);
      expect((await detail(alice, a.id, tour.id)).capacity).toBe(3);
    });

    it('un même pseudo ne s’inscrit qu’une fois, sans tenir compte de la casse', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id);
      await addPlayer(alice, a.id, tour.id, 'MonPseudo');
      const again = await alice.request(
        'POST',
        `/groups/${a.id}/tournaments/${tour.id}/registrations`,
        {
          name: 'monpseudo',
        },
      );
      expect(again.status).toBe(409);
      // Dans un autre tournoi, le même pseudo est libre.
      const other = await create(alice, a.id);
      await addPlayer(alice, a.id, other.id, 'MonPseudo');
    });

    it('plusieurs validations simultanées ne dépassent jamais la capacité', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id, { capacity: 2 });
      await t.prisma.registration.createMany({
        data: ['p1', 'p2', 'p3', 'p4', 'p5'].map((name) => ({
          tournamentId: tour.id,
          platoName: name,
          platoKey: name,
          status: RegistrationStatus.PENDING,
        })),
      });
      const rows = await t.prisma.registration.findMany({ where: { tournamentId: tour.id } });
      const replies = await Promise.all(
        rows.map((r) =>
          alice.request(
            'POST',
            `/groups/${a.id}/tournaments/${tour.id}/registrations/${r.id}/accept`,
          ),
        ),
      );
      expect(replies.every((r) => r.status === 200)).toBe(true);
      const accepted = await t.prisma.registration.count({
        where: { tournamentId: tour.id, status: RegistrationStatus.ACCEPTED },
      });
      const waiting = await t.prisma.registration.count({
        where: { tournamentId: tour.id, status: RegistrationStatus.WAITLIST },
      });
      expect([accepted, waiting]).toEqual([2, 3]);
    });

    it('valide une inscription en attente une seule fois', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id);
      const { registration } = (await (
        await publicRegister(tour.publicSlug, 'Joueur')
      ).body) as Registered;
      const path = `/groups/${a.id}/tournaments/${tour.id}/registrations/${registration.id}/accept`;
      expect((await alice.request('POST', path)).status).toBe(200);
      expect((await alice.request('POST', path)).status).toBe(409);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('pointage', () => {
    it('ne s’ouvre qu’en phase de pointage et ne vaut que pour les joueurs acceptés', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id, { capacity: 2 });
      const accepted = await addPlayer(alice, a.id, tour.id, 'Accepte');
      await addPlayer(alice, a.id, tour.id, 'Aussi');
      const waiting = await addPlayer(alice, a.id, tour.id, 'Attend');
      const base = `/groups/${a.id}/tournaments/${tour.id}`;
      const mark = (id: string, presence: string) =>
        alice.request('PATCH', `${base}/registrations/${id}`, { presence });

      expect((await mark(accepted.id, 'PRESENT')).status).toBe(409); // pointage pas encore ouvert
      await alice.request('PATCH', base, { status: 'CHECK_IN' });
      expect((await mark(accepted.id, 'PRESENT')).body).toMatchObject({ presence: 'PRESENT' });
      expect((await mark(accepted.id, 'ABSENT')).body).toMatchObject({ presence: 'ABSENT' });
      expect((await mark(waiting.id, 'PRESENT')).status).toBe(409); // en liste d'attente
      expect((await mark(accepted.id, 'ABSENT ')).status).toBe(400); // valeur inconnue

      const row = await t.prisma.registration.findUniqueOrThrow({ where: { id: waiting.id } });
      expect(row.presence).toBe(Presence.UNKNOWN);
      expect((await t.prisma.tournament.findUniqueOrThrow({ where: { id: tour.id } })).status).toBe(
        TournamentStatus.CHECK_IN,
      );
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('joueurs sans compte (lien public)', () => {
    it('montre le nom du tournoi, rien d’autre', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id);
      await addPlayer(alice, a.id, tour.id, 'Secret');
      const reply = await client().request('GET', `/public/tournaments/${tour.publicSlug}`);
      expect(reply.status).toBe(200);
      expect(reply.body).toEqual({
        name: 'Coupe du week-end',
        format: 'ELIMINATION',
        status: 'REGISTRATION',
        language: 'fr',
        registrationOpen: true,
      });
      expect((await client().request('GET', '/public/tournaments/' + 'x'.repeat(22))).status).toBe(
        404,
      );
      expect((await client().request('GET', '/public/tournaments/pas-un-lien')).status).toBe(400);
    });

    it('inscrit un joueur en attente de validation et lui donne un lien personnel', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id);
      const reply = await publicRegister(tour.publicSlug, '  Souley_42 ');
      expect(reply.status).toBe(201);
      const { registration, token } = reply.body as Registered;
      expect(registration).toMatchObject({ platoName: 'Souley_42', status: 'PENDING' });
      expect(token.length).toBeGreaterThanOrEqual(40);
      expect(JSON.stringify(reply.body)).not.toMatch(/tokenHash/);

      const row = await t.prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
      expect(row.tokenHash).not.toBeNull();
      expect(row.tokenHash).not.toBe(token); // seule l'empreinte est stockée
    });

    it('refuse les pseudos invalides et les doublons', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id);
      for (const name of ['', '   ', 'x'.repeat(65), 'a\u0000b', 'ligne\nfausse']) {
        expect((await publicRegister(tour.publicSlug, name)).status).toBe(400);
      }
      expect((await publicRegister(tour.publicSlug, 'Souley')).status).toBe(201);
      expect((await publicRegister(tour.publicSlug, 'SOULEY')).status).toBe(409);
    });

    it('refuse les inscriptions quand le tournoi est en pointage, et sur un lien inconnu', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id);
      await alice.request('PATCH', `/groups/${a.id}/tournaments/${tour.id}`, {
        status: 'CHECK_IN',
      });
      expect((await publicRegister(tour.publicSlug, 'Tard')).status).toBe(409);
      expect((await publicRegister('y'.repeat(22), 'Nul')).status).toBe(404);
    });

    it('borne les inscriptions en attente contre les robots', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id);
      await t.prisma.registration.createMany({
        data: Array.from({ length: MAX_PENDING }, (_, i) => ({
          tournamentId: tour.id,
          platoName: `bot${i}`,
          platoKey: `bot${i}`,
          status: RegistrationStatus.PENDING,
        })),
      });
      expect((await publicRegister(tour.publicSlug, 'Humain')).status).toBe(409);
    });

    it('le joueur suit son statut, sa position en liste d’attente, et jamais les autres', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id, { capacity: 2 });
      await addPlayer(alice, a.id, tour.id, 'Un');
      await addPlayer(alice, a.id, tour.id, 'Deux');
      const first = (await publicRegister(tour.publicSlug, 'Premier')).body as Registered;
      const second = (await publicRegister(tour.publicSlug, 'Second')).body as Registered;

      expect((await mine(first.token)).body).toMatchObject({
        platoName: 'Premier',
        status: 'PENDING',
        waitlistPosition: null,
        tournament: { name: 'Coupe du week-end', status: 'REGISTRATION' },
      });

      const base = `/groups/${a.id}/tournaments/${tour.id}/registrations`;
      await alice.request('POST', `${base}/${first.registration.id}/accept`);
      await alice.request('POST', `${base}/${second.registration.id}/accept`);
      expect((await mine(first.token)).body).toMatchObject({
        status: 'WAITLIST',
        waitlistPosition: 1,
      });
      const secondView = await mine(second.token);
      expect(secondView.body).toMatchObject({ status: 'WAITLIST', waitlistPosition: 2 });
      expect(JSON.stringify(secondView.body)).not.toMatch(/Premier|Un|tokenHash/);
    });

    it('un lien personnel inconnu, absent ou mal formé ne donne rien', async () => {
      const unknown = 'z'.repeat(43);
      expect((await mine(unknown)).status).toBe(404);
      expect((await client().request('GET', '/public/registration')).status).toBe(400);
      expect((await mine('court')).status).toBe(400);
      const del = await client().request('DELETE', '/public/registration', undefined, {
        headers: { 'x-player-token': unknown },
      });
      expect(del.status).toBe(404);
    });

    it('le lien d’un joueur ne sert qu’à lui : annuler libère sa place pour la liste d’attente', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id, { capacity: 2 });
      const base = `/groups/${a.id}/tournaments/${tour.id}/registrations`;
      await addPlayer(alice, a.id, tour.id, 'Premier');
      const one = (await publicRegister(tour.publicSlug, 'Un')).body as Registered;
      const two = (await publicRegister(tour.publicSlug, 'Deux')).body as Registered;
      await alice.request('POST', `${base}/${one.registration.id}/accept`);
      await alice.request('POST', `${base}/${two.registration.id}/accept`);
      expect((await mine(two.token)).body).toMatchObject({ status: 'WAITLIST' });

      const del = await client().request('DELETE', '/public/registration', undefined, {
        headers: { 'x-player-token': one.token },
      });
      expect(del.status).toBe(204);
      expect(
        await t.prisma.registration.findUnique({ where: { id: one.registration.id } }),
      ).toBeNull();
      expect((await mine(one.token)).status).toBe(404);
      expect((await mine(two.token)).body).toMatchObject({ status: 'ACCEPTED' });
    });

    it('les routes publiques n’ouvrent aucune route d’administration', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tour = await create(alice, a.id);
      const { token } = (await publicRegister(tour.publicSlug, 'Joueur')).body as Registered;
      const player = client();
      const headers = { 'x-player-token': token, 'x-csrf-token': token };
      expect(
        (await player.request('GET', `/groups/${a.id}/tournaments`, undefined, { headers })).status,
      ).toBe(401);
    });
  });
});
