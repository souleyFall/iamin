/**
 * Retours des utilisateurs : dépôt par un joueur sans compte ou par un admin, lecture réservée au
 * propriétaire de la plateforme, plafond de la boîte, purge des retours traités.
 * Même fonctionnement que les autres tests d'intégration : vraie API, vraie base `…_test`.
 */
import { FeedbackKind, FeedbackStatus, Role } from '@prisma/client';
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
import { FEEDBACK_RETENTION_MS, MAX_OPEN_FEEDBACK } from './feedback.service';

if (!testDatabaseUrl) {
  console.warn('⚠ TEST_DATABASE_URL absent : les tests d’intégration des retours sont ignorés.');
}

const PASSWORD = randomPassword();
const DAY = 24 * 60 * 60 * 1000;

interface Row {
  id: string;
  kind: string;
  message: string;
  contact: string | null;
  status: string;
  author: { username: string } | null;
}

describe.skipIf(!testDatabaseUrl)('retours des utilisateurs (base réelle)', () => {
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
    await t.prisma.$executeRawUnsafe('TRUNCATE TABLE "Feedback" RESTART IDENTITY CASCADE');
  });

  const loggedIn = async (username: string) => {
    const c = client();
    expect((await c.login(username, PASSWORD)).status).toBe(200);
    return c;
  };
  const accounts = async () => {
    await createUser(t.prisma, {
      username: 'owner',
      password: PASSWORD,
      role: Role.PLATFORM_OWNER,
    });
    await createUser(t.prisma, { username: 'alice', password: PASSWORD, role: Role.MEMBER });
  };
  const valid = { kind: 'IDEA', message: 'Un classement par saison serait super.' };

  describe('dépôt', () => {
    it('un joueur sans compte dépose un retour anonyme, avec un pseudo facultatif', async () => {
      const anonymous = await client().request('POST', '/public/feedback', valid);
      expect(anonymous.status).toBe(201);
      const named = await client().request('POST', '/public/feedback', {
        ...valid,
        kind: 'BUG',
        contact: 'Karim_77',
      });
      expect(named.status).toBe(201);
      const rows = await t.prisma.feedback.findMany({ orderBy: { createdAt: 'asc' } });
      expect(rows).toEqual([
        expect.objectContaining({ kind: 'IDEA', contact: null, authorId: null, status: 'NEW' }),
        expect.objectContaining({ kind: 'BUG', contact: 'Karim_77', authorId: null }),
      ]);
      // La réponse ne renvoie que l'identifiant : rien du message ni du pseudo.
      expect(Object.keys(named.body as object)).toEqual(['id']);
    });

    it('un admin connecté dépose un retour rattaché à son compte', async () => {
      await accounts();
      const alice = await loggedIn('alice');
      expect((await alice.request('POST', '/feedback', valid)).status).toBe(201);
      const row = await t.prisma.feedback.findFirstOrThrow({ include: { author: true } });
      expect(row.author?.username).toBe('alice');
    });

    it('sans connexion, la route des admins est fermée', async () => {
      expect((await client().request('POST', '/feedback', valid)).status).toBe(401);
      expect(await t.prisma.feedback.count()).toBe(0);
    });

    it('valide le type, le message et le pseudo, sans renvoyer ce qui a été envoyé', async () => {
      const bad: unknown[] = [
        { ...valid, kind: 'PIRATE' },
        { ...valid, kind: undefined },
        { ...valid, message: 'abc' },
        { ...valid, message: 'x'.repeat(2001) },
        { ...valid, message: `texte${String.fromCharCode(0)}piégé` },
        { ...valid, message: 42 },
        { ...valid, contact: '' },
        { ...valid, contact: 'a\nb' },
        { ...valid, contact: 'x'.repeat(65) },
      ];
      for (const body of bad) {
        const reply = await client().request('POST', '/public/feedback', body);
        expect(reply.status).toBe(400);
        expect(JSON.stringify(reply.body)).not.toContain('piégé');
      }
      expect(await t.prisma.feedback.count()).toBe(0);
    });

    it('garde les retours à la ligne du message', async () => {
      const message = 'Première ligne\n\nDeuxième ligne';
      expect(
        (await client().request('POST', '/public/feedback', { ...valid, message })).status,
      ).toBe(201);
      expect((await t.prisma.feedback.findFirstOrThrow()).message).toBe(message);
    });

    it('refuse les retours anonymes quand la boîte est pleine, pas ceux des admins', async () => {
      await accounts();
      await t.prisma.feedback.createMany({
        data: Array.from({ length: MAX_OPEN_FEEDBACK }, () => ({
          kind: FeedbackKind.OTHER,
          message: 'remplissage',
        })),
      });
      expect((await client().request('POST', '/public/feedback', valid)).status).toBe(503);
      expect((await (await loggedIn('alice')).request('POST', '/feedback', valid)).status).toBe(
        201,
      );
      // Traiter des retours libère de la place.
      await t.prisma.feedback.updateMany({
        data: { status: FeedbackStatus.DONE, handledAt: new Date() },
      });
      expect((await client().request('POST', '/public/feedback', valid)).status).toBe(201);
    });
  });

  describe('boîte du propriétaire', () => {
    it('lui seul lit, classe, supprime et purge : tout autre compte est refusé', async () => {
      await accounts();
      const row = await t.prisma.feedback.create({ data: { kind: 'BUG', message: 'Un bug ici.' } });
      const alice = await loggedIn('alice');
      const anonymous = client();
      for (const [c, status] of [
        [alice, 403],
        [anonymous, 401],
      ] as const) {
        expect((await c.request('GET', '/feedback')).status).toBe(status);
        expect((await c.request('PATCH', `/feedback/${row.id}`, { status: 'DONE' })).status).toBe(
          status,
        );
        expect((await c.request('DELETE', `/feedback/${row.id}`)).status).toBe(status);
        expect((await c.request('POST', '/feedback/purge')).status).toBe(status);
      }
      const after = await t.prisma.feedback.findUniqueOrThrow({ where: { id: row.id } });
      expect(after.status).toBe('NEW');
    });

    it('liste les retours avec leur auteur, filtrés par statut, les plus récents d’abord', async () => {
      await accounts();
      const alice = await loggedIn('alice');
      await alice.request('POST', '/feedback', { kind: 'IMPROVEMENT', message: 'Premier retour.' });
      await client().request('POST', '/public/feedback', {
        kind: 'IDEA',
        message: 'Second retour.',
        contact: 'Sana.fx',
      });
      const owner = await loggedIn('owner');
      const all = (await owner.request('GET', '/feedback')).body as Row[];
      expect(all.map((r) => r.message)).toEqual(['Second retour.', 'Premier retour.']);
      expect(all[0]).toMatchObject({ contact: 'Sana.fx', author: null, status: 'NEW' });
      expect(all[1]).toMatchObject({ author: { username: 'alice' } });
      expect(JSON.stringify(all)).not.toMatch(/passwordHash|authorId/);

      await owner.request('PATCH', `/feedback/${all[1]?.id ?? ''}`, { status: 'READ' });
      const read = (await owner.request('GET', '/feedback?status=READ')).body as Row[];
      expect(read.map((r) => r.message)).toEqual(['Premier retour.']);
      expect((await owner.request('GET', '/feedback?status=PIRATE')).status).toBe(400);
    });

    it('passer à « traité » date le traitement ; revenir en arrière l’efface', async () => {
      await accounts();
      const row = await t.prisma.feedback.create({ data: { kind: 'IDEA', message: 'Une idée.' } });
      const owner = await loggedIn('owner');
      expect((await owner.request('PATCH', `/feedback/${row.id}`, { status: 'DONE' })).status).toBe(
        204,
      );
      expect(
        (await t.prisma.feedback.findUniqueOrThrow({ where: { id: row.id } })).handledAt,
      ).not.toBeNull();
      await owner.request('PATCH', `/feedback/${row.id}`, { status: 'NEW' });
      expect(
        (await t.prisma.feedback.findUniqueOrThrow({ where: { id: row.id } })).handledAt,
      ).toBeNull();

      const unknown = '00000000-0000-4000-8000-000000000000';
      expect(
        (await owner.request('PATCH', `/feedback/${unknown}`, { status: 'READ' })).status,
      ).toBe(404);
      expect(
        (await owner.request('PATCH', '/feedback/pas-un-uuid', { status: 'READ' })).status,
      ).toBe(400);
      expect(
        (await owner.request('PATCH', `/feedback/${row.id}`, { status: 'PIRATE' })).status,
      ).toBe(400);
    });

    it('supprime un retour pour de bon', async () => {
      await accounts();
      const row = await t.prisma.feedback.create({
        data: { kind: 'OTHER', message: 'À effacer.' },
      });
      const owner = await loggedIn('owner');
      expect((await owner.request('DELETE', `/feedback/${row.id}`)).status).toBe(204);
      expect(await t.prisma.feedback.count()).toBe(0);
      expect((await owner.request('DELETE', `/feedback/${row.id}`)).status).toBe(404);
    });

    it('la purge ne supprime que les retours traités depuis plus d’un an', async () => {
      await accounts();
      const old = new Date(Date.now() - FEEDBACK_RETENTION_MS - DAY);
      const recent = new Date(Date.now() - FEEDBACK_RETENTION_MS + DAY);
      const make = (message: string, status: FeedbackStatus, handledAt: Date | null) =>
        t.prisma.feedback.create({
          data: { kind: 'OTHER', message, status, handledAt, createdAt: old },
        });
      await make('traité ancien', FeedbackStatus.DONE, old);
      await make('traité récent', FeedbackStatus.DONE, recent);
      await make('nouveau ancien', FeedbackStatus.NEW, null);
      await make('lu ancien', FeedbackStatus.READ, null);

      const owner = await loggedIn('owner');
      const reply = await owner.request('POST', '/feedback/purge');
      expect(reply.status).toBe(200);
      expect(reply.body).toEqual({ deleted: 1 });
      const left = (await t.prisma.feedback.findMany()).map((r) => r.message).sort();
      expect(left).toEqual(['lu ancien', 'nouveau ancien', 'traité récent']);
    });

    it('supprimer le compte d’un admin garde son retour, désormais sans auteur', async () => {
      await accounts();
      await (await loggedIn('alice')).request('POST', '/feedback', valid);
      await t.prisma.user.delete({ where: { username: 'alice' } });
      const row = await t.prisma.feedback.findFirstOrThrow();
      expect(row.authorId).toBeNull();
    });

    it('rien n’est lisible sans passer par le propriétaire', async () => {
      expect((await client().request('GET', '/public/feedback')).status).toBe(404);
    });
  });
});
