/**
 * Tests d'intégration de la page publique et du flux en direct (D7, D18).
 * Vraie API, vraie base `…_test`. Les routes sont publiques : on vérifie surtout CE QU'ELLES NE
 * MONTRENT PAS (inscriptions en attente, jetons, détenteur de la main, versions des scores).
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
import { LiveService } from './live.service';

if (!testDatabaseUrl) {
  console.warn('⚠ TEST_DATABASE_URL absent : les tests d’intégration du direct sont ignorés.');
}

const PASSWORD = randomPassword();

interface PublicView {
  name: string;
  status: string;
  registrationOpen: boolean;
  revision: number;
  drawn: boolean;
  players: { id: string; platoName: string; status: string }[];
  bracket?: { rounds: { id: string; winner: string | null }[][] };
  champion?: string | null;
  seed?: string;
  initialPlayers?: string[];
  [key: string]: unknown;
}

/** Lecteur minimal de flux SSE : renvoie les messages `data:` au fur et à mesure. */
async function openStream(url: string) {
  const controller = new AbortController();
  const res = await fetch(url, { signal: controller.signal });
  const reader = res.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const next = async (): Promise<{ type: string; data: { revision?: number } }> => {
    for (;;) {
      const end = buffer.indexOf('\n\n');
      if (end !== -1) {
        const raw = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const type = /^event: (.*)$/m.exec(raw)?.[1] ?? 'message';
        const data = /^data: (.*)$/m.exec(raw)?.[1];
        if (data === undefined) continue;
        return { type, data: JSON.parse(data) as { revision?: number } };
      }
      const chunk = await reader?.read();
      if (!chunk || chunk.done) throw new Error('flux fermé');
      buffer += decoder.decode(chunk.value, { stream: true });
    }
  };
  return { res, next, close: () => controller.abort() };
}

const timeout = <T>(p: Promise<T>, ms = 8_000): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('délai dépassé')), ms)),
  ]);

describe.skipIf(!testDatabaseUrl)('page publique et direct (base réelle)', () => {
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

  async function setup() {
    const group = await t.prisma.group.create({ data: { name: 'Groupe A' } });
    const user = await createUser(t.prisma, {
      username: 'alice',
      password: PASSWORD,
      role: Role.MEMBER,
    });
    await t.prisma.groupMember.create({
      data: { groupId: group.id, userId: user.id, role: GroupRole.SUPER_ADMIN },
    });
    const admin = client();
    expect((await admin.login('alice', PASSWORD)).status).toBe(200);
    return { group, admin };
  }

  async function create(admin: Client, groupId: string, name: string) {
    const r = await admin.request('POST', `/groups/${groupId}/tournaments`, {
      name,
      format: 'ELIMINATION',
      capacity: 4,
    });
    expect(r.status).toBe(201);
    const body = r.body as { id: string; publicSlug: string };
    return {
      id: body.id,
      slug: body.publicSlug,
      base: `/groups/${groupId}/tournaments/${body.id}`,
    };
  }

  async function drawn(admin: Client, base: string) {
    const ids: string[] = [];
    for (const name of ['P1', 'P2', 'P3', 'P4']) {
      const r = await admin.request('POST', `${base}/registrations`, { name });
      ids.push((r.body as { id: string }).id);
    }
    await admin.request('PATCH', base, { status: 'CHECK_IN' });
    for (const id of ids) {
      await admin.request('PATCH', `${base}/registrations/${id}`, { presence: 'PRESENT' });
    }
    expect((await admin.request('POST', `${base}/draw`, {})).status).toBe(201);
  }

  const view = async (slug: string) => {
    const r = await new Client(t.url, undefined).request('GET', `/public/tournaments/${slug}/view`);
    return r;
  };

  it('montre les inscrits validés mais jamais les inscriptions en attente', async () => {
    const { group, admin } = await setup();
    const { slug, base } = await create(admin, group.id, 'Coupe publique');
    const anon = new Client(t.url, undefined);
    await anon.request('POST', `/public/tournaments/${slug}/registrations`, { name: 'Curieux' });
    await admin.request('POST', `${base}/registrations`, { name: 'Valide' });

    const r = await view(slug);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    const v = r.body as PublicView;
    expect(v.name).toBe('Coupe publique');
    expect(v.drawn).toBe(false);
    expect(v.registrationOpen).toBe(true);
    expect(v.players.map((p) => p.platoName)).toEqual(['Valide']);
    expect(JSON.stringify(v)).not.toContain('Curieux');
  });

  it('montre le tableau et la graine après le tirage, sans secret ni version', async () => {
    const { group, admin } = await setup();
    const { slug, base } = await create(admin, group.id, 'Coupe tirée');
    await drawn(admin, base);
    const v = (await view(slug)).body as PublicView;
    expect(v.drawn).toBe(true);
    expect(v.bracket?.rounds.length).toBe(2);
    expect(typeof v.seed).toBe('string');
    expect(v.initialPlayers).toHaveLength(4);
    // Rien de ce qui sert aux admins ou aux joueurs n'apparaît.
    for (const forbidden of [
      'versions',
      'holder',
      'holderId',
      'handoverTo',
      'tokenHash',
      'groupId',
    ]) {
      expect(forbidden in v).toBe(false);
    }
    const text = JSON.stringify(v);
    expect(text).not.toContain('alice');
    expect(text).not.toContain(group.id);
  });

  it('suit les scores : un score saisi par l’admin apparaît et la révision avance', async () => {
    const { group, admin } = await setup();
    const { slug, base } = await create(admin, group.id, 'Coupe scores');
    await drawn(admin, base);
    const before = (await view(slug)).body as PublicView;
    const first = before.bracket?.rounds[0]?.[0]?.id ?? '';
    const put = await admin.request('PUT', `${base}/matches/${first}/result`, { a: 3, b: 1 });
    expect(put.status).toBe(200);
    const after = (await view(slug)).body as PublicView;
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(after.bracket?.rounds[0]?.[0]?.winner).not.toBeNull();
  });

  it('refuse un lien inconnu ou mal formé, et n’accepte aucune écriture', async () => {
    const { group, admin } = await setup();
    const { slug } = await create(admin, group.id, 'Coupe');
    const anon = new Client(t.url, undefined);
    expect((await view('a'.repeat(22))).status).toBe(404);
    expect((await view('court')).status).toBe(400);
    expect((await view('x'.repeat(100))).status).toBe(400);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const r = await anon.request(method, `/public/tournaments/${slug}/view`, {});
      expect(r.status).toBe(404);
    }
  });

  it('un lien ne montre que SON tournoi', async () => {
    const { group, admin } = await setup();
    const one = await create(admin, group.id, 'Premier');
    const two = await create(admin, group.id, 'Second');
    expect(((await view(one.slug)).body as PublicView).name).toBe('Premier');
    expect(((await view(two.slug)).body as PublicView).name).toBe('Second');
    // L'identifiant interne n'ouvre pas la page publique.
    expect((await view(one.id)).status).toBe(404);
  });

  it('diffuse un message à chaque changement, sans compte ni donnée du tournoi', async () => {
    const { group, admin } = await setup();
    const { slug, base } = await create(admin, group.id, 'Coupe direct');
    const stream = await openStream(`${t.url}/public/tournaments/${slug}/live`);
    try {
      expect(stream.res.status).toBe(200);
      expect(stream.res.headers.get('content-type')).toContain('text/event-stream');
      const first = await timeout(stream.next());
      expect(first.type).toBe('changed');
      const revision = first.data.revision ?? -1;
      expect(revision).toBeGreaterThan(0);

      await admin.request('POST', `${base}/registrations`, { name: 'Arrivant' });
      const second = await timeout(stream.next());
      expect(second.type).toBe('changed');
      expect(second.data.revision).toBeGreaterThan(revision);
      // Le message ne porte que la révision.
      expect(Object.keys(second.data)).toEqual(['revision']);
    } finally {
      stream.close();
    }
  });

  it('n’annonce un changement qu’une fois validé : la vue le contient déjà', async () => {
    const { group, admin } = await setup();
    const { slug, base } = await create(admin, group.id, 'Coupe validée');
    const stream = await openStream(`${t.url}/public/tournaments/${slug}/live`);
    try {
      const first = await timeout(stream.next());
      await admin.request('POST', `${base}/registrations`, { name: 'Visible' });
      const msg = await timeout(stream.next());
      expect(msg.data.revision).toBeGreaterThan(first.data.revision ?? 0);
      const v = (await view(slug)).body as PublicView;
      expect(v.revision).toBeGreaterThanOrEqual(msg.data.revision ?? Infinity);
      expect(v.players.map((p) => p.platoName)).toContain('Visible');
    } finally {
      stream.close();
    }
  });

  it('refuse un flux pour un lien inconnu et libère la connexion à la fermeture', async () => {
    const { group, admin } = await setup();
    const { slug } = await create(admin, group.id, 'Coupe ferme');
    const bad = await fetch(`${t.url}/public/tournaments/${'z'.repeat(22)}/live`);
    expect(bad.status).toBe(404);
    await bad.text();

    const live = t.app.get(LiveService);
    const stream = await openStream(`${t.url}/public/tournaments/${slug}/live`);
    await timeout(stream.next());
    expect(live.openStreams).toBe(1);
    stream.close();
    await timeout(
      (async () => {
        while (live.openStreams !== 0) await new Promise((r) => setTimeout(r, 50));
      })(),
    );
    expect(live.openStreams).toBe(0);
  });
});
