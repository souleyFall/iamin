import 'reflect-metadata';
import { Controller, Get, type INestApplication, Post, Body } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupApp } from '../app.setup';
import type { AppConfig } from '../config';
import { LocalizedExceptionFilter } from '../i18n/localized-exception.filter';
import { AppLogger, describeError, logger } from './app-logger';
import { ClientErrorsController } from './client-errors.controller';
import { runWithContext } from './context';

const config: AppConfig = {
  nodeEnv: 'test',
  port: 0,
  databaseUrl: 'postgresql://u:p@localhost:5432/db',
  webOrigin: 'http://localhost:5173',
  sessionCookieSecure: false,
  trustProxy: 0,
  totpEncryptionKey: Buffer.alloc(32, 7),
  logLevel: 'silent',
};

describe('AppLogger', () => {
  const lines: Record<string, unknown>[] = [];
  const make = (level: 'debug' | 'info' | 'warn' | 'error' | 'silent' = 'debug') =>
    new AppLogger(level, (line) => lines.push(JSON.parse(line) as Record<string, unknown>));
  beforeEach(() => (lines.length = 0));

  it('écrit une ligne JSON avec heure, niveau, contexte et message', () => {
    make().write('info', 'Test', 'bonjour', { event: 'x.y' });
    expect(lines[0]).toMatchObject({ level: 'info', ctx: 'Test', msg: 'bonjour', event: 'x.y' });
    expect(typeof lines[0]?.ts).toBe('string');
  });

  it('ignore ce qui est sous le niveau demandé, et tout en « silent »', () => {
    make('warn').write('info', 'T', 'non');
    make('warn').write('error', 'T', 'oui');
    make('silent').write('error', 'T', 'non');
    expect(lines.map((l) => l.msg)).toEqual(['oui']);
  });

  it('ajoute l’identifiant de la requête et le compte quand il y en a une', () => {
    runWithContext({ reqId: 'req-1', userId: 'user-1' }, () => make().write('info', 'T', 'dans'));
    make().write('info', 'T', 'hors');
    expect(lines[0]).toMatchObject({ reqId: 'req-1', userId: 'user-1' });
    expect(lines[1]).not.toHaveProperty('reqId');
  });

  it('masque tout champ dont le nom évoque un secret, même imbriqué', () => {
    make().write('info', 'T', 'x', {
      password: 'hunter2',
      csrfToken: 'abc',
      nested: { sessionCookie: 'zzz', ok: 'visible' },
      errorCode: 'P2002',
    });
    const line = JSON.stringify(lines[0]);
    expect(line).not.toContain('hunter2');
    expect(line).not.toContain('abc');
    expect(line).not.toContain('zzz');
    expect(lines[0]).toMatchObject({ nested: { ok: 'visible' }, errorCode: 'P2002' });
  });

  it('garde une ligne par événement : un saut de ligne dans un texte ne fabrique pas de fausse ligne', () => {
    make().write('info', 'T', 'a\n{"level":"error","msg":"faux"}');
    expect(lines).toHaveLength(1);
    expect(lines[0]?.level).toBe('info');
  });

  it('décrit une erreur de la base sans recopier les valeurs de la requête', () => {
    const error = Object.assign(new Error('Invalid `prisma.user.create()` data: hunter2'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { target: ['username'] },
    });
    const described = JSON.stringify(describeError(error));
    expect(described).toContain('P2002');
    expect(described).toContain('username');
    expect(described).not.toContain('hunter2');
  });
});

@Controller('boom')
class BoomController {
  @Get('crash')
  crash(): never {
    throw new Error('secret-interne : mot de passe=hunter2');
  }
  @Post('echo')
  echo(@Body() body: unknown): unknown {
    return body;
  }
}

describe('journal des requêtes et des erreurs', () => {
  let app: INestApplication;
  let url: string;
  const lines: Record<string, unknown>[] = [];

  beforeEach(async () => {
    lines.length = 0;
    const moduleRef = await Test.createTestingModule({
      controllers: [BoomController, ClientErrorsController],
      providers: [{ provide: APP_FILTER, useClass: LocalizedExceptionFilter }],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app, config);
    // setupApp règle le niveau ; on branche ensuite notre capteur.
    logger.configure('debug', (line) => lines.push(JSON.parse(line) as Record<string, unknown>));
    await app.listen(0);
    url = await app.getUrl();
  });
  afterEach(async () => {
    await app.close();
    logger.configure('silent');
  });

  it('une erreur inattendue donne un 500 sans détail, un identifiant, et une ligne complète au journal', async () => {
    const res = await fetch(`${url}/boom/crash`, { headers: { 'accept-language': 'en' } });
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ statusCode: 500, message: 'Internal server error' });
    expect(text).not.toContain('hunter2');
    const reqId = res.headers.get('x-request-id');
    expect(reqId).toMatch(/^[0-9a-f-]{36}$/);

    const error = lines.find((l) => l.event === 'http.error');
    expect(error).toMatchObject({
      level: 'error',
      reqId,
      route: '/boom/crash',
      status: 500,
      errorName: 'Error',
    });
    expect(String(error?.stack)).toContain('BoomController');
    // La ligne de fin de requête porte le même identifiant et le niveau « error ».
    const done = lines.find((l) => l.event === 'http.request');
    expect(done).toMatchObject({ level: 'error', reqId, method: 'GET', status: 500 });
  });

  it('chaque requête a son identifiant, et la route écrite est celle du gestionnaire, pas l’adresse', async () => {
    const a = await fetch(`${url}/boom/echo?secret=abc`, {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    const b = await fetch(`${url}/boom/echo`, {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect(a.headers.get('x-request-id')).not.toBe(b.headers.get('x-request-id'));
    const entry = lines.find((l) => l.event === 'http.request');
    expect(entry).toMatchObject({ route: '/boom/echo', status: 201 });
    expect(JSON.stringify(lines)).not.toContain('secret=abc');
  });

  it('une route inconnue est un avertissement, sans l’adresse demandée', async () => {
    const res = await fetch(`${url}/introuvable/jeton-secret-123`);
    expect(res.status).toBe(404);
    const entry = lines.find((l) => l.event === 'http.request');
    expect(entry).toMatchObject({ level: 'warn', status: 404, route: 'route inconnue' });
    expect(JSON.stringify(lines)).not.toContain('jeton-secret-123');
  });

  it('une erreur du navigateur est journalisée, nettoyée, sans la query ni l’ancre', async () => {
    const res = await fetch(`${url}/public/client-errors`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'render',
        message: 'x is undefined',
        stack: 'at Foo (app.js:1)',
        page: '/t/mon-tournoi?joueur=jeton-perso#ancre',
      }),
    });
    expect(res.status).toBe(204);
    const entry = lines.find((l) => l.event === 'client.error');
    expect(entry).toMatchObject({
      level: 'warn',
      kind: 'render',
      page: '/t/mon-tournoi',
    });
    expect(JSON.stringify(lines)).not.toContain('jeton-perso');
  });

  it('refuse un rapport d’erreur démesuré ou mal formé', async () => {
    const send = (body: unknown) =>
      fetch(`${url}/public/client-errors`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    expect((await send({ kind: 'render', message: 'x'.repeat(301) })).status).toBe(400);
    expect((await send({ kind: 'autre', message: 'x' })).status).toBe(400);
  });
});
