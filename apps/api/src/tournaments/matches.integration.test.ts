/**
 * Tests d'intégration du tirage, des scores, des forfaits et des remplacements.
 * Vraie API, vraie base `…_test`. Comme pour les tournois, l'ACCÈS CROISÉ (R1) est testé en détail.
 */
import { buildBracket, buildLeague } from '@iamin/engine';
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
  console.warn('⚠ TEST_DATABASE_URL absent : les tests d’intégration des matchs sont ignorés.');
}

// Mot de passe de test tiré au hasard : rien d'écrit en dur dans le dépôt.
const PASSWORD = randomPassword();

interface PlayerView {
  id: string;
  platoName: string;
  status: string;
}
interface BracketMatch {
  id: string;
  a: string | null;
  b: string | null;
  winner: string | null;
  status: string;
  score: { a: number; b: number } | null;
}
interface View {
  format: string;
  status: string;
  seed: string;
  initialPlayers: string[];
  forfeitScore: number;
  players: PlayerView[];
  forfeits: Record<string, string>;
  bracket?: { size: number; byes: number; rounds: BracketMatch[][] };
  champion?: string | null;
  schedule?: {
    legs: number;
    rounds: { id: string; a: string; b: string }[][];
    rests: (string | null)[];
  };
  standings?: {
    complete: boolean;
    played: number;
    total: number;
    rows: { playerId: string; rank: number; points: number; wins: number }[];
  };
}

describe.skipIf(!testDatabaseUrl)('tirage, scores et remplacements (base réelle)', () => {
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

  /**
   * Crée un tournoi, y inscrit `names`, ouvre le pointage et note `present` joueurs présents
   * (les premiers). Les autres restent « inconnus ». Renvoie les chemins utiles.
   */
  async function ready(
    c: Client,
    groupId: string,
    opts: { format?: string; names: string[]; capacity?: number; present?: number },
  ) {
    const created = await c.request('POST', `/groups/${groupId}/tournaments`, {
      name: 'Tournoi test',
      format: opts.format ?? 'ELIMINATION',
      capacity: opts.capacity ?? Math.max(2, opts.names.length),
    });
    expect(created.status).toBe(201);
    const tour = created.body as { id: string };
    const base = `/groups/${groupId}/tournaments/${tour.id}`;
    const players: { id: string; name: string; status: string }[] = [];
    for (const name of opts.names) {
      const r = await c.request('POST', `${base}/registrations`, { name });
      expect(r.status).toBe(201);
      const body = r.body as { id: string; status: string };
      players.push({ id: body.id, name, status: body.status });
    }
    expect((await c.request('PATCH', base, { status: 'CHECK_IN' })).status).toBe(200);
    const presentCount = opts.present ?? opts.names.length;
    for (const p of players.filter((x) => x.status === 'ACCEPTED').slice(0, presentCount)) {
      const r = await c.request('PATCH', `${base}/registrations/${p.id}`, { presence: 'PRESENT' });
      expect(r.status).toBe(200);
    }
    return { base, tourId: tour.id, players };
  }

  const draw = (c: Client, base: string, body: unknown = {}) =>
    c.request('POST', `${base}/draw`, body);
  const view = async (c: Client, base: string) =>
    (await c.request('GET', `${base}/draw`)).body as View;
  const score = (c: Client, base: string, code: string, body: unknown) =>
    c.request('PUT', `${base}/matches/${code}/result`, body);
  const match = (v: View, code: string) => v.bracket!.rounds.flat().find((m) => m.id === code)!;

  // -----------------------------------------------------------------------------------------
  describe('tirage', () => {
    it('exige le pointage ouvert et au moins deux joueurs présents', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const created = (
        await alice.request('POST', `/groups/${a.id}/tournaments`, {
          name: 'Trop tôt',
          format: 'ELIMINATION',
          capacity: 4,
        })
      ).body as { id: string };
      const early = `/groups/${a.id}/tournaments/${created.id}`;
      expect((await draw(alice, early)).status).toBe(409); // inscriptions encore ouvertes

      const solo = await ready(alice, a.id, { names: ['Un', 'Deux'], present: 1 });
      expect((await draw(alice, solo.base)).status).toBe(409); // un seul présent
      expect((await alice.request('GET', `${solo.base}/draw`)).status).toBe(404); // pas de tirage
    });

    it('ne tire que les joueurs acceptés ET présents, avec une graine vérifiable', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      // 5 acceptés : 3 présents (les 3 premiers), 1 absent, 1 inconnu.
      const r = await ready(alice, a.id, {
        names: ['P1', 'P2', 'P3', 'P4', 'P5'],
        present: 3,
      });
      await alice.request('PATCH', `${r.base}/registrations/${r.players[3]!.id}`, {
        presence: 'ABSENT',
      });

      const reply = await draw(alice, r.base);
      expect(reply.status).toBe(201);
      const v = reply.body as View;
      expect(v.status).toBe('STARTED');
      expect(v.seed).toMatch(/^[0-9a-f]{32}$/);
      const presentIds = r.players.slice(0, 3).map((p) => p.id);
      expect(v.initialPlayers).toEqual([...presentIds].sort());
      expect(v.bracket).toMatchObject({ size: 4, byes: 1 });

      // Vérifiable : n'importe qui refait le tirage avec la graine et la liste publiées.
      const again = buildBracket(v.initialPlayers, v.seed);
      const first = v.bracket!.rounds[0]!.map((m) => [m.a, m.b]);
      const expected = again.rounds[0]!.map((m) => [
        m.a.kind === 'player' ? m.a.playerId : null,
        m.b.kind === 'player' ? m.b.playerId : null,
      ]);
      expect(first).toEqual(expected);
    });

    it('ne se fait qu’une fois, même demandé deux fois en même temps', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const r = await ready(alice, a.id, { names: ['P1', 'P2', 'P3', 'P4'] });
      const replies = await Promise.all([draw(alice, r.base), draw(alice, r.base)]);
      expect(replies.map((x) => x.status).sort()).toEqual([201, 409]);
      expect((await draw(alice, r.base)).status).toBe(409);
      const row = await t.prisma.tournament.findUniqueOrThrow({ where: { id: r.tourId } });
      expect(row.drawPlayers).toHaveLength(4);
    });

    it('fige les inscriptions, le pointage et les places après le tirage', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const r = await ready(alice, a.id, { names: ['P1', 'P2', 'P3', 'P4'], capacity: 8 });
      const slug = (await alice.request('GET', r.base)).body as { publicSlug: string };
      await draw(alice, r.base);

      expect(
        (await alice.request('POST', `${r.base}/registrations`, { name: 'Tard' })).status,
      ).toBe(409);
      expect((await alice.request('PATCH', r.base, { capacity: 4 })).status).toBe(409);
      expect((await alice.request('PATCH', r.base, { status: 'REGISTRATION' })).status).toBe(409);
      expect(
        (await alice.request('DELETE', `${r.base}/registrations/${r.players[0]!.id}`)).status,
      ).toBe(409);
      expect(
        (
          await alice.request('PATCH', `${r.base}/registrations/${r.players[0]!.id}`, {
            presence: 'ABSENT',
          })
        ).status,
      ).toBe(409);
      const pub = await client().request(
        'POST',
        `/public/tournaments/${slug.publicSlug}/registrations`,
        {
          name: 'Public',
        },
      );
      expect(pub.status).toBe(409);
      // Le nom reste modifiable.
      expect((await alice.request('PATCH', r.base, { name: 'Renommé' })).status).toBe(200);
    });

    it('un tirage de ligue tient en 32 joueurs au plus, avec aller-retour en option', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const tooBig = await alice.request('POST', `/groups/${a.id}/tournaments`, {
        name: 'Géante',
        format: 'LEAGUE',
        capacity: 33,
      });
      expect(tooBig.status).toBe(400);

      const r = await ready(alice, a.id, { format: 'LEAGUE', names: ['P1', 'P2', 'P3', 'P4'] });
      expect((await draw(alice, r.base, { legs: 3 })).status).toBe(400);
      const v = (await draw(alice, r.base, { legs: 2 })).body as View;
      expect(v.schedule!.legs).toBe(2);
      expect(v.schedule!.rounds).toHaveLength(6);
      const again = buildLeague(v.initialPlayers, v.seed, { legs: 2 });
      expect(v.schedule!.rounds.map((m) => m.map((x) => [x.a, x.b]))).toEqual(
        again.rounds.map((m) => m.map((x) => [x.a, x.b])),
      );
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('scores en élimination directe', () => {
    it('fait avancer les vainqueurs jusqu’au champion, puis termine le tournoi', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const r = await ready(alice, a.id, { names: ['P1', 'P2', 'P3', 'P4'] });
      let v = (await draw(alice, r.base)).body as View;

      // La finale n'a pas encore ses joueurs : score refusé.
      expect((await score(alice, r.base, 'R2M1', { a: 2, b: 1 })).status).toBe(409);

      const one = match(v, 'R1M1');
      const two = match(v, 'R1M2');
      v = (await score(alice, r.base, 'R1M1', { a: 3, b: 1 })).body as View;
      expect(match(v, 'R1M1')).toMatchObject({ winner: one.a, status: 'done' });
      v = (await score(alice, r.base, 'R1M2', { a: 0, b: 2 })).body as View;
      expect(match(v, 'R2M1')).toMatchObject({ a: one.a, b: two.b, status: 'ready' });
      expect(v.status).toBe('STARTED');

      v = (await score(alice, r.base, 'R2M1', { a: 1, b: 2 })).body as View;
      expect(v.champion).toBe(two.b);
      expect(v.status).toBe('FINISHED');
    });

    it('refuse les scores invalides, les matchs inconnus et les byes', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const r = await ready(alice, a.id, { names: ['P1', 'P2', 'P3'] }); // 1 bye
      const v = (await draw(alice, r.base)).body as View;
      const real = v.bracket!.rounds[0]!.find((m) => m.status === 'ready')!;
      const bye = v.bracket!.rounds[0]!.find((m) => m.status === 'bye')!;

      for (const body of [
        { a: 1, b: 1 },
        { a: -1, b: 0 },
        { a: 1.5, b: 0 },
        { a: 100, b: 0 },
        { a: '2', b: 1 },
        { a: 2 },
        { a: 2, b: 1, extra: true },
        { forfeit: 'c' },
        {},
      ]) {
        expect((await score(alice, r.base, real.id, body)).status, JSON.stringify(body)).toBe(400);
      }
      expect((await score(alice, r.base, 'R9M9', { a: 2, b: 1 })).status).toBe(404);
      expect((await score(alice, r.base, 'pas-un-code', { a: 2, b: 1 })).status).toBe(400);
      expect((await score(alice, r.base, bye.id, { a: 2, b: 1 })).status).toBe(409);
      expect(await t.prisma.matchResult.count()).toBe(0);
    });

    it('corrige un score, mais pas un vainqueur dont le match suivant est joué', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const r = await ready(alice, a.id, { names: ['P1', 'P2', 'P3', 'P4'] });
      await draw(alice, r.base);
      await score(alice, r.base, 'R1M1', { a: 3, b: 1 });
      await score(alice, r.base, 'R1M2', { a: 2, b: 0 });
      await score(alice, r.base, 'R2M1', { a: 2, b: 1 });

      // Même vainqueur : correction libre.
      expect((await score(alice, r.base, 'R1M1', { a: 2, b: 0 })).status).toBe(200);
      // Autre vainqueur alors que la finale est jouée : refusé.
      expect((await score(alice, r.base, 'R1M1', { a: 0, b: 2 })).status).toBe(409);
      expect((await alice.request('DELETE', `${r.base}/matches/R1M1/result`)).status).toBe(409);

      // On annule d'abord la finale : le tournoi n'est plus terminé, puis on peut corriger.
      const reopened = (await alice.request('DELETE', `${r.base}/matches/R2M1/result`))
        .body as View;
      expect(reopened.status).toBe('STARTED');
      expect((await score(alice, r.base, 'R1M1', { a: 0, b: 2 })).status).toBe(200);
      expect((await alice.request('DELETE', `${r.base}/matches/R2M1/result`)).status).toBe(404);
    });

    it('un forfait donne le score par défaut du tournoi au vainqueur', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const r = await ready(alice, a.id, { names: ['P1', 'P2', 'P3', 'P4'] });
      await draw(alice, r.base);

      let v = (await score(alice, r.base, 'R1M1', { forfeit: 'a' })).body as View;
      expect(match(v, 'R1M1')).toMatchObject({ score: { a: 0, b: 1 } });
      expect(v.forfeits).toEqual({ R1M1: 'A' });
      expect(match(v, 'R1M1').winner).toBe(match(v, 'R1M1').b);

      expect((await alice.request('PATCH', r.base, { forfeitScore: 3 })).status).toBe(200);
      v = (await score(alice, r.base, 'R1M2', { forfeit: 'b' })).body as View;
      expect(match(v, 'R1M2').score).toEqual({ a: 3, b: 0 });
      // Un vrai score efface la marque de forfait.
      v = (await score(alice, r.base, 'R1M2', { a: 2, b: 1 })).body as View;
      expect(v.forfeits).toEqual({ R1M1: 'A' });
    });

    it('deux scores saisis en même temps sont tous les deux enregistrés', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const second = await loggedIn('alice'); // deuxième onglet du même admin
      const r = await ready(alice, a.id, { names: ['P1', 'P2', 'P3', 'P4'] });
      await draw(alice, r.base);
      const replies = await Promise.all([
        score(alice, r.base, 'R1M1', { a: 2, b: 0 }),
        score(second, r.base, 'R1M2', { a: 0, b: 2 }),
      ]);
      expect(replies.map((x) => x.status)).toEqual([200, 200]);
      expect(await t.prisma.matchResult.count()).toBe(2);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('ligue', () => {
    it('calcule le classement et termine quand tous les matchs sont joués', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const r = await ready(alice, a.id, { format: 'LEAGUE', names: ['P1', 'P2', 'P3'] });
      let v = (await draw(alice, r.base)).body as View;
      expect(v.schedule!.rounds.flat()).toHaveLength(3);
      expect(v.standings).toMatchObject({ played: 0, total: 3, complete: false });

      const codes = v.schedule!.rounds.flat().map((m) => m.id);
      for (const code of codes) {
        v = (await score(alice, r.base, code, { a: 2, b: 1 })).body as View;
      }
      expect(v.standings).toMatchObject({ played: 3, total: 3, complete: true });
      expect(v.status).toBe('FINISHED');
      expect(v.standings!.rows.map((x) => x.rank)).toEqual([1, 2, 3]);

      // En ligue, tout score se corrige librement, et le tournoi se rouvre si besoin.
      v = (await alice.request('DELETE', `${r.base}/matches/${codes[0]!}/result`)).body as View;
      expect(v.status).toBe('STARTED');
      expect(v.standings!.complete).toBe(false);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('remplacements', () => {
    async function started() {
      const { a, b } = await world();
      const alice = await loggedIn('alice');
      // 5 inscrits pour 4 places : le 5e est en liste d'attente.
      const r = await ready(alice, a.id, {
        names: ['P1', 'P2', 'P3', 'P4', 'P5'],
        capacity: 4,
      });
      const v = (await draw(alice, r.base)).body as View;
      return { a, b, alice, r, v, waiting: r.players[4]! };
    }

    it('remplace un joueur qui n’a pas joué par un joueur de la liste d’attente', async () => {
      const { alice, r, v, waiting } = await started();
      const out = match(v, 'R1M1').a!;
      const reply = await alice.request('POST', `${r.base}/replacements`, {
        outId: out,
        inId: waiting.id,
      });
      expect(reply.status).toBe(200);
      const after = reply.body as View;
      expect(match(after, 'R1M1').a).toBe(waiting.id);
      // Le tirage d'origine reste vérifiable : graine et liste inchangées.
      expect(after.seed).toBe(v.seed);
      expect(after.initialPlayers).toEqual(v.initialPlayers);
      expect(after.players.find((p) => p.id === out)?.status).toBe('REPLACED');
      expect(after.players.find((p) => p.id === waiting.id)?.status).toBe('ACCEPTED');
      const row = await t.prisma.registration.findUniqueOrThrow({ where: { id: waiting.id } });
      expect(row.presence).toBe('PRESENT');
    });

    it('refuse de remplacer un joueur qui a déjà joué, ou par un joueur invalide', async () => {
      const { alice, r, v, waiting } = await started();
      const played = match(v, 'R1M1');
      await score(alice, r.base, 'R1M1', { a: 2, b: 1 });
      const replace = (outId: string, inId: string) =>
        alice.request('POST', `${r.base}/replacements`, { outId, inId });

      expect((await replace(played.a!, waiting.id)).status).toBe(409); // a déjà joué
      const other = match(v, 'R1M2').a!;
      expect((await replace(other, played.b!)).status).toBe(409); // déjà dans le tirage
      expect((await replace(other, other)).status).toBe(400);
      expect((await replace(waiting.id, other)).status).toBe(404); // n'est pas dans le tirage
      expect((await replace(other, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
      expect((await replace(other, 'pas-un-uuid')).status).toBe(400);
      expect((await replace(other, waiting.id)).status).toBe(200);
      // Le remplacé (statut REPLACED) ne peut pas revenir.
      expect((await replace(match(v, 'R1M2').b!, other)).status).toBe(404);
    });

    it('un joueur en attente de validation ne peut pas être le remplaçant', async () => {
      const { alice, r, v } = await started();
      const pending = await t.prisma.registration.create({
        data: {
          tournamentId: r.tourId,
          platoName: 'Public',
          platoKey: 'public',
          status: 'PENDING',
        },
      });
      const reply = await alice.request('POST', `${r.base}/replacements`, {
        outId: match(v, 'R1M1').a,
        inId: pending.id,
      });
      expect(reply.status).toBe(404);
    });
  });

  // -----------------------------------------------------------------------------------------
  describe('ACCÈS CROISÉ : un groupe ne touche pas aux matchs d’un autre', () => {
    it('alice ne lit ni ne modifie le tirage du groupe B, par aucune route', async () => {
      const { a, b } = await world();
      const alice = await loggedIn('alice');
      const bob = await loggedIn('bob');
      const own = await ready(alice, a.id, { names: ['A1', 'A2', 'A3', 'A4', 'A5'], capacity: 4 });
      await draw(alice, own.base);
      const rb = await ready(bob, b.id, { names: ['B1', 'B2', 'B3', 'B4', 'B5'], capacity: 4 });
      const vb = (await draw(bob, rb.base)).body as View;
      await score(bob, rb.base, 'R1M1', { a: 2, b: 0 });
      const before = await t.prisma.matchResult.findMany({ orderBy: { code: 'asc' } });

      const players = vb.initialPlayers;
      const routes = (base: string): [string, string, unknown][] => [
        ['GET', `${base}/draw`, undefined],
        ['POST', `${base}/draw`, {}],
        ['PUT', `${base}/matches/R1M1/result`, { a: 0, b: 2 }],
        ['PUT', `${base}/matches/R1M2/result`, { a: 2, b: 0 }],
        ['DELETE', `${base}/matches/R1M1/result`, undefined],
        ['POST', `${base}/replacements`, { outId: players[0], inId: rb.players[4]!.id }],
      ];
      // 1) Directement dans le groupe B : refusé par GroupGuard.
      for (const [method, path, body] of routes(rb.base)) {
        expect((await alice.request(method, path, body)).status, `${method} ${path}`).toBe(404);
      }
      // 2) Par SON groupe, avec l'identifiant du tournoi de B : introuvable.
      const viaA = `/groups/${a.id}/tournaments/${rb.tourId}`;
      for (const [method, path, body] of routes(viaA)) {
        expect((await alice.request(method, path, body)).status, `${method} ${path}`).toBe(404);
      }
      // 3) Dans SON tournoi, avec les identifiants de joueurs de B : introuvables.
      const own1 = (await view(alice, own.base)).bracket!.rounds[0]![0]!.a!;
      const mixed = await alice.request('POST', `${own.base}/replacements`, {
        outId: own1,
        inId: rb.players[4]!.id,
      });
      expect(mixed.status).toBe(404);

      expect(await t.prisma.matchResult.findMany({ orderBy: { code: 'asc' } })).toEqual(before);
      expect((await view(bob, rb.base)).status).toBe('STARTED');
    });

    it('le propriétaire de la plateforme et les anonymes n’ont aucun accès', async () => {
      const { a } = await world();
      const alice = await loggedIn('alice');
      const r = await ready(alice, a.id, { names: ['P1', 'P2', 'P3', 'P4'] });
      await draw(alice, r.base);

      const owner = await loggedIn('owner');
      const anonymous = client();
      for (const [method, path, body] of [
        ['GET', `${r.base}/draw`, undefined],
        ['POST', `${r.base}/draw`, {}],
        ['PUT', `${r.base}/matches/R1M1/result`, { a: 2, b: 0 }],
        ['DELETE', `${r.base}/matches/R1M1/result`, undefined],
        ['POST', `${r.base}/replacements`, {}],
      ] as const) {
        expect((await owner.request(method, path, body)).status, `owner ${method}`).toBe(404);
        expect((await anonymous.request(method, path, body)).status, `anon ${method}`).toBe(401);
      }
    });

    it('un admin retiré du groupe perd l’accès au tirage tout de suite', async () => {
      const { a } = await world();
      const adam = await loggedIn('adam');
      const r = await ready(adam, a.id, { names: ['P1', 'P2', 'P3', 'P4'] });
      await draw(adam, r.base);
      const alice = await loggedIn('alice');
      const adamUser = await t.prisma.user.findUniqueOrThrow({ where: { username: 'adam' } });
      await alice.request('DELETE', `/groups/${a.id}/members/${adamUser.id}`);
      expect((await adam.request('GET', `${r.base}/draw`)).status).toBe(404);
      expect((await score(adam, r.base, 'R1M1', { a: 2, b: 0 })).status).toBe(404);
    });
  });
});
