/**
 * Tests d'intégration du relais entre admins (D5) et du journal d'événements (R14).
 * Vraie API, vraie base `…_test`. L'ACCÈS CROISÉ (R1) couvre aussi les routes de relais.
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
  console.warn('⚠ TEST_DATABASE_URL absent : les tests d’intégration du relais sont ignorés.');
}

// Mot de passe de test tiré au hasard : rien d'écrit en dur dans le dépôt.
const PASSWORD = randomPassword();

interface TournamentView {
  id: string;
  holder: { id: string; username: string } | null;
  handoverTo: { id: string; username: string } | null;
}
interface JournalEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  actor: { id: string; username: string } | null;
}
interface Journal {
  events: JournalEvent[];
  nextBefore: string | null;
}

describe.skipIf(!testDatabaseUrl)('relais et journal (base réelle)', () => {
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

  /** A : alice (super admin), adam et ada (admins). B : bob (super admin). Et le propriétaire. */
  async function world() {
    await createUser(t.prisma, {
      username: 'owner',
      password: PASSWORD,
      role: Role.PLATFORM_OWNER,
    });
    const a = await t.prisma.group.create({ data: { name: 'Groupe A' } });
    const b = await t.prisma.group.create({ data: { name: 'Groupe B' } });
    const alice = await member('alice', a.id, GroupRole.SUPER_ADMIN);
    const adam = await member('adam', a.id, GroupRole.ADMIN);
    const ada = await member('ada', a.id, GroupRole.ADMIN);
    const bob = await member('bob', b.id, GroupRole.SUPER_ADMIN);
    return { a, b, alice, adam, ada, bob };
  }

  /** `c` crée un tournoi (il en tient donc la main) ; `drawn` : 4 joueurs présents puis tirage. */
  async function tournament(c: Client, groupId: string, drawn = false) {
    const created = await c.request('POST', `/groups/${groupId}/tournaments`, {
      name: 'Tournoi relais',
      format: 'ELIMINATION',
      capacity: 4,
    });
    expect(created.status).toBe(201);
    const id = (created.body as { id: string }).id;
    const base = `/groups/${groupId}/tournaments/${id}`;
    const players: string[] = [];
    if (drawn) {
      for (const name of ['P1', 'P2', 'P3', 'P4']) {
        const r = await c.request('POST', `${base}/registrations`, { name });
        players.push((r.body as { id: string }).id);
      }
      await c.request('PATCH', base, { status: 'CHECK_IN' });
      for (const pid of players) {
        await c.request('PATCH', `${base}/registrations/${pid}`, { presence: 'PRESENT' });
      }
      expect((await c.request('POST', `${base}/draw`, {})).status).toBe(201);
    }
    return { id, base, players };
  }

  const holderOf = async (base: string, c: Client) =>
    ((await c.request('GET', base)).body as TournamentView).holder?.username ?? null;
  const journal = async (c: Client, base: string, query = '') =>
    (await c.request('GET', `${base}/events${query}`)).body as Journal;
  const types = async (c: Client, base: string) =>
    (await journal(c, base)).events.map((e) => e.type).reverse();

  // -----------------------------------------------------------------------------------------
  describe('la main : un seul admin écrit', () => {
    it('le créateur tient la main ; les autres admins lisent mais n’écrivent pas', async () => {
      const { a } = await world();
      const adam = await loggedIn('adam');
      const alice = await loggedIn('alice'); // même un super admin
      const tour = await tournament(adam, a.id, true);
      expect(await holderOf(tour.base, alice)).toBe('adam');

      // Lecture : libre pour tout admin du groupe.
      expect((await alice.request('GET', tour.base)).status).toBe(200);
      expect((await alice.request('GET', `${tour.base}/draw`)).status).toBe(200);
      expect((await alice.request('GET', `${tour.base}/events`)).status).toBe(200);

      const before = await t.prisma.matchResult.count();
      const player = tour.players[0]!;
      const writes: [string, string, unknown][] = [
        ['PATCH', tour.base, { name: 'Volé' }],
        ['POST', `${tour.base}/registrations`, { name: 'Intrus' }],
        ['POST', `${tour.base}/registrations/${player}/accept`, undefined],
        ['PATCH', `${tour.base}/registrations/${player}`, { presence: 'ABSENT' }],
        ['DELETE', `${tour.base}/registrations/${player}`, undefined],
        ['POST', `${tour.base}/draw`, {}],
        ['PUT', `${tour.base}/matches/R1M1/result`, { a: 2, b: 0 }],
        ['DELETE', `${tour.base}/matches/R1M1/result`, undefined],
        ['POST', `${tour.base}/replacements`, { outId: player, inId: tour.players[1] }],
      ];
      for (const [method, path, body] of writes) {
        expect((await alice.request(method, path, body)).status, `${method} ${path}`).toBe(403);
      }
      expect(await t.prisma.matchResult.count()).toBe(before);
      const row = await t.prisma.tournament.findUniqueOrThrow({ where: { id: tour.id } });
      expect(row.name).toBe('Tournoi relais');

      // Le détenteur, lui, écrit.
      expect(
        (await adam.request('PUT', `${tour.base}/matches/R1M1/result`, { a: 2, b: 0 })).status,
      ).toBe(200);
    });

    it('sans détenteur, personne n’écrit tant qu’un admin n’a pas pris la main', async () => {
      const { a } = await world();
      const adam = await loggedIn('adam');
      const ada = await loggedIn('ada');
      const tour = await tournament(adam, a.id);

      const released = await adam.request('POST', `${tour.base}/relay/release`);
      expect(released.status).toBe(200);
      expect((released.body as TournamentView).holder).toBeNull();
      expect((await adam.request('PATCH', tour.base, { name: 'Libre' })).status).toBe(403);
      expect((await adam.request('POST', `${tour.base}/relay/release`)).status).toBe(403);

      expect((await ada.request('POST', `${tour.base}/relay/take`)).status).toBe(200);
      expect(await holderOf(tour.base, ada)).toBe('ada');
      expect((await ada.request('PATCH', tour.base, { name: 'Pris' })).status).toBe(200);
      expect((await adam.request('PATCH', tour.base, { name: 'Non' })).status).toBe(403);
    });

    it('un admin ne prend pas la main d’un autre ; un super admin la reprend', async () => {
      const { a } = await world();
      const adam = await loggedIn('adam');
      const ada = await loggedIn('ada');
      const alice = await loggedIn('alice');
      const tour = await tournament(adam, a.id);

      expect((await adam.request('POST', `${tour.base}/relay/take`)).status).toBe(409); // déjà à lui
      expect((await ada.request('POST', `${tour.base}/relay/take`)).status).toBe(403);
      expect(await holderOf(tour.base, ada)).toBe('adam');

      const reclaimed = await alice.request('POST', `${tour.base}/relay/take`);
      expect(reclaimed.status).toBe(200);
      expect((reclaimed.body as TournamentView).holder?.username).toBe('alice');
      expect((await adam.request('PATCH', tour.base, { name: 'Non' })).status).toBe(403);
      const last = (await journal(alice, tour.base)).events[0]!;
      expect(last).toMatchObject({ type: 'RELAY_RECLAIMED', actor: { username: 'alice' } });
    });

    it('deux prises simultanées d’une main libre : une seule réussit', async () => {
      const { a } = await world();
      const adam = await loggedIn('adam');
      const ada = await loggedIn('ada');
      const tour = await tournament(adam, a.id);
      await adam.request('POST', `${tour.base}/relay/release`);
      const replies = await Promise.all([
        adam.request('POST', `${tour.base}/relay/take`),
        ada.request('POST', `${tour.base}/relay/take`),
      ]);
      expect(replies.map((r) => r.status).sort()).toEqual([200, 403]);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('passer le relais', () => {
    it('le détenteur propose, le destinataire accepte : la main change à l’acceptation seulement', async () => {
      const { a, ada } = await world();
      const adam = await loggedIn('adam');
      const adaClient = await loggedIn('ada');
      const tour = await tournament(adam, a.id);

      const offered = await adam.request('POST', `${tour.base}/relay/offer`, {
        toUserId: ada.id,
      });
      expect(offered.status).toBe(200);
      expect(offered.body).toMatchObject({
        holder: { username: 'adam' },
        handoverTo: { username: 'ada' },
      });
      // Tant qu'elle n'a pas accepté : adam écrit encore, ada pas.
      expect((await adam.request('PATCH', tour.base, { name: 'Toujours moi' })).status).toBe(200);
      expect((await adaClient.request('PATCH', tour.base, { name: 'Trop tôt' })).status).toBe(403);

      const accepted = await adaClient.request('POST', `${tour.base}/relay/accept`);
      expect(accepted.status).toBe(200);
      expect(accepted.body).toMatchObject({ holder: { username: 'ada' }, handoverTo: null });
      expect((await adaClient.request('PATCH', tour.base, { name: 'À moi' })).status).toBe(200);
      expect((await adam.request('PATCH', tour.base, { name: 'Plus moi' })).status).toBe(403);
    });

    it('le destinataire peut refuser, le détenteur annuler', async () => {
      const { a, ada } = await world();
      const adam = await loggedIn('adam');
      const adaClient = await loggedIn('ada');
      const tour = await tournament(adam, a.id);
      const offer = () => adam.request('POST', `${tour.base}/relay/offer`, { toUserId: ada.id });

      await offer();
      const declined = await adaClient.request('POST', `${tour.base}/relay/decline`);
      expect(declined.body).toMatchObject({ holder: { username: 'adam' }, handoverTo: null });

      await offer();
      const canceled = await adam.request('DELETE', `${tour.base}/relay/offer`);
      expect(canceled.body).toMatchObject({ holder: { username: 'adam' }, handoverTo: null });
      expect((await adam.request('DELETE', `${tour.base}/relay/offer`)).status).toBe(404);
      expect((await adaClient.request('POST', `${tour.base}/relay/accept`)).status).toBe(403);
    });

    it('seul le destinataire accepte ; seul le détenteur propose', async () => {
      const { a, ada } = await world();
      const adam = await loggedIn('adam');
      const alice = await loggedIn('alice');
      const adaClient = await loggedIn('ada');
      const tour = await tournament(adam, a.id);
      await adam.request('POST', `${tour.base}/relay/offer`, { toUserId: ada.id });

      // Ni le détenteur, ni un super admin, ni un tiers ne peuvent accepter à la place de ada.
      expect((await adam.request('POST', `${tour.base}/relay/accept`)).status).toBe(403);
      expect((await alice.request('POST', `${tour.base}/relay/accept`)).status).toBe(403);
      expect((await alice.request('POST', `${tour.base}/relay/decline`)).status).toBe(403);
      // Un non-détenteur ne propose rien, même à lui-même.
      const alicesId = (await t.prisma.user.findUniqueOrThrow({ where: { username: 'alice' } })).id;
      expect(
        (await adaClient.request('POST', `${tour.base}/relay/offer`, { toUserId: alicesId }))
          .status,
      ).toBe(403);
      expect(await holderOf(tour.base, adam)).toBe('adam');
    });

    it('refuse une proposition à soi-même, à un inconnu ou à un admin d’un autre groupe', async () => {
      const { a, adam: adamUser, bob } = await world();
      const adam = await loggedIn('adam');
      const tour = await tournament(adam, a.id);
      const offer = (toUserId: unknown) =>
        adam.request('POST', `${tour.base}/relay/offer`, { toUserId });

      expect((await offer(adamUser.id)).status).toBe(400);
      expect((await offer(bob.id)).status).toBe(404); // bob n'est pas membre du groupe A
      expect((await offer('00000000-0000-4000-8000-000000000000')).status).toBe(404);
      expect((await offer('pas-un-uuid')).status).toBe(400);
      expect(
        (await t.prisma.tournament.findUniqueOrThrow({ where: { id: tour.id } })).handoverToId,
      ).toBeNull();
    });

    it('un admin retiré du groupe perd la main et les propositions qui le visent', async () => {
      const { a, ada, adam: adamUser } = await world();
      const adam = await loggedIn('adam');
      const alice = await loggedIn('alice');
      const tour = await tournament(adam, a.id);
      await adam.request('POST', `${tour.base}/relay/offer`, { toUserId: ada.id });

      // On retire ada (destinataire) : la proposition tombe.
      await alice.request('DELETE', `/groups/${a.id}/members/${ada.id}`);
      let row = await t.prisma.tournament.findUniqueOrThrow({ where: { id: tour.id } });
      expect(row.handoverToId).toBeNull();
      expect(row.holderId).toBe(adamUser.id);

      // On retire adam (détenteur) : la main se libère, un autre admin ou le super admin la prend.
      await alice.request('DELETE', `/groups/${a.id}/members/${adamUser.id}`);
      row = await t.prisma.tournament.findUniqueOrThrow({ where: { id: tour.id } });
      expect(row.holderId).toBeNull();
      expect((await alice.request('POST', `${tour.base}/relay/take`)).status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('journal d’événements', () => {
    it('trace chaque changement avec son auteur, sans aucun pseudo', async () => {
      const { a, ada } = await world();
      const adam = await loggedIn('adam');
      const adaClient = await loggedIn('ada');
      const tour = await tournament(adam, a.id, true);
      await adam.request('PUT', `${tour.base}/matches/R1M1/result`, { a: 2, b: 1 });
      await adam.request('POST', `${tour.base}/relay/offer`, { toUserId: ada.id });
      await adaClient.request('POST', `${tour.base}/relay/accept`);
      await adaClient.request('DELETE', `${tour.base}/matches/R1M1/result`);

      expect(await types(adaClient, tour.base)).toEqual([
        'TOURNAMENT_CREATED',
        'PLAYER_ADDED',
        'PLAYER_ADDED',
        'PLAYER_ADDED',
        'PLAYER_ADDED',
        'TOURNAMENT_UPDATED',
        'PRESENCE_SET',
        'PRESENCE_SET',
        'PRESENCE_SET',
        'PRESENCE_SET',
        'DRAW_DONE',
        'RESULT_SET',
        'RELAY_OFFERED',
        'RELAY_ACCEPTED',
        'RESULT_DELETED',
      ]);
      const events = (await journal(adaClient, tour.base)).events;
      expect(events[0]).toMatchObject({
        type: 'RESULT_DELETED',
        actor: { username: 'ada' },
        payload: { code: 'R1M1' },
      });
      const set = events.find((e) => e.type === 'RESULT_SET')!;
      expect(set).toMatchObject({
        actor: { username: 'adam' },
        payload: { code: 'R1M1', a: 2, b: 1, version: 1 },
      });
      const draw = events.find((e) => e.type === 'DRAW_DONE')!;
      expect(draw.payload).toMatchObject({ players: 4 });
      expect(draw.payload.seed).toMatch(/^[0-9a-f]{32}$/);
      // Minimisation : aucun pseudo de joueur dans le journal.
      expect(JSON.stringify(events)).not.toMatch(/P1|P2|P3|P4/);
    });

    it('ne garde aucune trace d’une action refusée, et note les actions des joueurs sans compte', async () => {
      const { a } = await world();
      const adam = await loggedIn('adam');
      const alice = await loggedIn('alice');
      const tour = await tournament(adam, a.id);
      const slug = ((await adam.request('GET', tour.base)).body as { publicSlug: string })
        .publicSlug;

      expect((await alice.request('PATCH', tour.base, { name: 'Refusé' })).status).toBe(403);
      const reg = await client().request('POST', `/public/tournaments/${slug}/registrations`, {
        name: 'Joueur',
      });
      expect(reg.status).toBe(201);

      expect(await types(adam, tour.base)).toEqual(['TOURNAMENT_CREATED', 'PLAYER_REGISTERED']);
      const last = (await journal(adam, tour.base)).events[0]!;
      expect(last.actor).toBeNull();
      expect(JSON.stringify(last)).not.toContain('Joueur');
    });

    it('annule le changement ET la trace ensemble (même transaction)', async () => {
      const { a } = await world();
      const adam = await loggedIn('adam');
      const tour = await tournament(adam, a.id);
      await adam.request('POST', `${tour.base}/registrations`, { name: 'Doublon' });
      const dup = await adam.request('POST', `${tour.base}/registrations`, { name: 'doublon' });
      expect(dup.status).toBe(409);
      const added = (await journal(adam, tour.base)).events.filter(
        (e) => e.type === 'PLAYER_ADDED',
      );
      expect(added).toHaveLength(1);
    });

    it('se pagine du plus récent au plus ancien, avec un curseur valide seulement', async () => {
      const { a } = await world();
      const adam = await loggedIn('adam');
      const tour = await tournament(adam, a.id);
      for (const name of ['A1', 'A2', 'A3']) {
        await adam.request('POST', `${tour.base}/registrations`, { name });
      }
      const first = await journal(adam, tour.base, '?limit=2');
      expect(first.events).toHaveLength(2);
      expect(first.nextBefore).toBe(first.events[1]!.id);
      const second = await journal(adam, tour.base, `?limit=2&before=${first.nextBefore}`);
      expect(second.events).toHaveLength(2);
      expect(second.nextBefore).toBeNull();
      expect(second.events.at(-1)!.type).toBe('TOURNAMENT_CREATED');
      const all = [...first.events, ...second.events].map((e) => e.id);
      expect(new Set(all).size).toBe(4);

      for (const query of ['?limit=0', '?limit=101', '?limit=abc', '?before=pas-un-uuid']) {
        expect((await adam.request('GET', `${tour.base}/events${query}`)).status, query).toBe(400);
      }
      expect(
        (
          await adam.request(
            'GET',
            `${tour.base}/events?before=00000000-0000-4000-8000-000000000000`,
          )
        ).status,
      ).toBe(400);
    });

    it('un curseur d’un autre tournoi est refusé', async () => {
      const { a } = await world();
      const adam = await loggedIn('adam');
      const one = await tournament(adam, a.id);
      const two = await tournament(adam, a.id);
      const foreign = (await journal(adam, two.base)).events[0]!.id;
      expect((await adam.request('GET', `${one.base}/events?before=${foreign}`)).status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('version des scores', () => {
    it('refuse d’écraser un score qui a changé depuis l’affichage', async () => {
      const { a } = await world();
      const adam = await loggedIn('adam');
      const tour = await tournament(adam, a.id, true);
      const put = (body: unknown) => adam.request('PUT', `${tour.base}/matches/R1M1/result`, body);

      expect((await put({ a: 2, b: 0, version: 1 })).status).toBe(409); // il n'y a pas encore de score
      const first = await put({ a: 2, b: 0, version: 0 });
      expect((first.body as { versions: Record<string, number> }).versions).toEqual({ R1M1: 1 });
      const second = await put({ a: 2, b: 1, version: 1 });
      expect(second.status).toBe(200);
      expect((second.body as { versions: Record<string, number> }).versions).toEqual({ R1M1: 2 });
      // Un écran resté sur la version 1 ne peut plus écraser.
      expect((await put({ a: 0, b: 2, version: 1 })).status).toBe(409);
      expect((await put({ forfeit: 'a', version: 1 })).status).toBe(409);
      // Sans version, la saisie reste permise (le détenteur est seul à écrire).
      expect((await put({ a: 2, b: 0 })).status).toBe(200);
      expect((await put({ a: 2, b: 0, version: -1 })).status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('ACCÈS CROISÉ : relais et journal d’un autre groupe', () => {
    it('alice ne voit ni ne touche au relais et au journal d’un tournoi du groupe B', async () => {
      const { a, b, bob } = await world();
      const bobClient = await loggedIn('bob');
      const alice = await loggedIn('alice');
      const tourB = await tournament(bobClient, b.id);
      const tourA = await tournament(await loggedIn('adam'), a.id);

      const routes = (base: string): [string, string, unknown][] => [
        ['GET', `${base}/events`, undefined],
        ['POST', `${base}/relay/take`, undefined],
        ['POST', `${base}/relay/release`, undefined],
        ['POST', `${base}/relay/offer`, { toUserId: bob.id }],
        ['DELETE', `${base}/relay/offer`, undefined],
        ['POST', `${base}/relay/accept`, undefined],
        ['POST', `${base}/relay/decline`, undefined],
      ];
      // Directement dans le groupe B, puis par son propre groupe avec l'identifiant du tournoi de B.
      for (const base of [tourB.base, `/groups/${a.id}/tournaments/${tourB.id}`]) {
        for (const [method, path, body] of routes(base)) {
          expect((await alice.request(method, path, body)).status, `${method} ${path}`).toBe(404);
        }
      }
      // Dans SON groupe, proposer le relais à un admin de B : introuvable (pas membre de A).
      const adam = await loggedIn('adam');
      expect(
        (await adam.request('POST', `${tourA.base}/relay/offer`, { toUserId: bob.id })).status,
      ).toBe(404);
      // Le super admin de B ne reprend pas la main d'un tournoi de A.
      expect((await bobClient.request('POST', `${tourA.base}/relay/take`)).status).toBe(404);
      expect((await bobClient.request('GET', `${tourA.base}/events`)).status).toBe(404);

      const rowB = await t.prisma.tournament.findUniqueOrThrow({ where: { id: tourB.id } });
      expect(rowB.holderId).toBe(bob.id);
      expect(rowB.handoverToId).toBeNull();
      const rowA = await t.prisma.tournament.findUniqueOrThrow({ where: { id: tourA.id } });
      expect(rowA.holderId).not.toBe(bob.id);
    });

    it('le propriétaire de la plateforme et les anonymes n’ont aucun accès', async () => {
      const { a } = await world();
      const tour = await tournament(await loggedIn('adam'), a.id);
      const owner = await loggedIn('owner');
      const anonymous = client();
      for (const [method, path, body] of [
        ['GET', `${tour.base}/events`, undefined],
        ['POST', `${tour.base}/relay/take`, undefined],
        ['POST', `${tour.base}/relay/release`, undefined],
        ['POST', `${tour.base}/relay/offer`, { toUserId: tour.id }],
        ['POST', `${tour.base}/relay/accept`, undefined],
      ] as const) {
        expect((await owner.request(method, path, body)).status, `owner ${method} ${path}`).toBe(
          404,
        );
        expect((await anonymous.request(method, path, body)).status, `anon ${method} ${path}`).toBe(
          401,
        );
      }
    });
  });
});
