import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupApp } from './app.setup';
import type { AppConfig } from './config';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';

const config: AppConfig = {
  nodeEnv: 'test',
  port: 0,
  databaseUrl: 'postgresql://u:p@localhost:5432/db',
  webOrigin: 'http://localhost:5173',
  sessionCookieSecure: false,
};

async function start(ping: () => Promise<void>): Promise<{ app: INestApplication; url: string }> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: PrismaService, useValue: { ping } }],
  }).compile();
  const app = moduleRef.createNestApplication();
  setupApp(app, config);
  await app.listen(0);
  return { app, url: await app.getUrl() };
}

describe('API', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  describe('GET /health', () => {
    let url = '';
    beforeEach(async () => {
      ({ app, url } = await start(() => Promise.resolve()));
    });

    it('répond ok quand la base répond', async () => {
      const res = await fetch(`${url}/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok', db: 'up' });
    });

    it('envoie les en-têtes de sécurité et masque le serveur', async () => {
      const res = await fetch(`${url}/health`);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBeTruthy();
      expect(res.headers.get('x-powered-by')).toBeNull();
    });

    it('autorise uniquement l’origine de l’interface (CORS strict)', async () => {
      const allowed = await fetch(`${url}/health`, { headers: { origin: config.webOrigin } });
      expect(allowed.headers.get('access-control-allow-origin')).toBe(config.webOrigin);
      expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');

      const other = await fetch(`${url}/health`, { headers: { origin: 'https://evil.example' } });
      // Le serveur annonce toujours la seule origine autorisée : le navigateur refuse l'autre.
      // Jamais `*`, et jamais l'origine de l'appelant recopiée.
      expect(other.headers.get('access-control-allow-origin')).toBe(config.webOrigin);
      expect(other.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
    });
  });

  it('répond 503 sans détail quand la base est injoignable', async () => {
    let url: string;
    ({ app, url } = await start(() =>
      Promise.reject(new Error('connexion refusée : secret-interne')),
    ));
    const res = await fetch(`${url}/health`);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ status: 'error', db: 'down' });
    expect(text).not.toContain('secret-interne');
  });
});
