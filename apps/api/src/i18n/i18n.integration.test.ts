/**
 * Messages d'erreur dans la langue demandée (`Accept-Language`) : vraie API, vraie base `…_test`.
 * Le corps garde sa forme (statut, `message`, `errors`, `code`) ; seul le texte change de langue.
 */
import { Role } from '@prisma/client';
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
  console.warn('⚠ TEST_DATABASE_URL absent : les tests d’intégration des langues sont ignorés.');
}

const PASSWORD = randomPassword();
const lang = (accept: string) => ({ headers: { 'accept-language': accept } });

describe.skipIf(!testDatabaseUrl)('messages d’erreur multilingues (base réelle)', () => {
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

  const loginFailure = (accept: string | undefined) =>
    client().request(
      'POST',
      '/auth/login',
      { username: 'personne', password: 'x'.repeat(12) },
      accept === undefined ? {} : lang(accept),
    );

  it('répond dans la langue demandée, en français par défaut', async () => {
    const replies = await Promise.all([
      loginFailure(undefined),
      loginFailure('fr'),
      loginFailure('en-GB,en;q=0.9'),
      loginFailure('es-MX,es;q=0.9,en;q=0.5'),
    ]);
    expect(replies.map((r) => r.status)).toEqual([401, 401, 401, 401]);
    expect(replies.map((r) => (r.body as { message: string }).message)).toEqual([
      'Identifiant ou mot de passe incorrect',
      'Identifiant ou mot de passe incorrect',
      'Wrong username or password',
      'Identificador o contraseña incorrectos',
    ]);
  });

  it('garde la forme de la réponse : statut et corps', async () => {
    const reply = await loginFailure('en');
    expect(reply.body).toMatchObject({ statusCode: 401, message: 'Wrong username or password' });
  });

  it('une langue inconnue retombe sur le français', async () => {
    const reply = await loginFailure('ja,ar;q=0.8');
    expect((reply.body as { message: string }).message).toBe(
      'Identifiant ou mot de passe incorrect',
    );
  });

  it('traduit aussi les erreurs de champ des formulaires, sans toucher au nom du champ', async () => {
    await createUser(t.prisma, { username: 'chef', password: PASSWORD, role: Role.GROUP_CREATOR });
    const c = client();
    await c.login('chef', PASSWORD);
    const reply = await c.request('POST', '/groups', { name: 'a' }, lang('en'));
    expect(reply.status).toBe(400);
    expect(reply.body).toMatchObject({
      message: 'Invalid data',
      errors: [{ field: 'name', message: 'At least 2 characters' }],
    });
    const es = await c.request('POST', '/groups', { name: 'a' }, lang('es'));
    expect(es.body).toMatchObject({
      message: 'Datos no válidos',
      errors: [{ field: 'name', message: 'Al menos 2 caracteres' }],
    });
  });

  it('traduit les refus de droits en gardant le code lisible par machine', async () => {
    await createUser(t.prisma, {
      username: 'owner',
      password: PASSWORD,
      role: Role.PLATFORM_OWNER,
    });
    const c = client();
    await c.login('owner', PASSWORD);
    await t.prisma.session.updateMany({ data: { elevatedUntil: null } });
    const reply = await c.request('POST', '/feedback/purge', undefined, lang('en'));
    expect(reply.status).toBe(403);
    expect(reply.body).toMatchObject({
      code: 'ELEVATION_REQUIRED',
      message: 'Confirm with your 6-digit code to continue',
    });
  });

  it('un groupe inconnu et un groupe interdit restent indiscernables dans chaque langue', async () => {
    await createUser(t.prisma, { username: 'alice', password: PASSWORD, role: Role.MEMBER });
    const c = client();
    await c.login('alice', PASSWORD);
    const unknown = await c.request(
      'GET',
      '/groups/00000000-0000-4000-8000-000000000000',
      undefined,
      lang('es'),
    );
    const malformed = await c.request('GET', '/groups/pas-un-uuid', undefined, lang('es'));
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual(malformed.body);
    expect((unknown.body as { message: string }).message).toBe('Grupo no encontrado');
  });

  it('laisse intact un message hors catalogue (route inconnue)', async () => {
    const reply = await client().request('GET', '/nulle-part', undefined, lang('es'));
    expect(reply.status).toBe(404);
    expect((reply.body as { message: string }).message).toMatch(/Cannot GET \/nulle-part/);
  });
});
