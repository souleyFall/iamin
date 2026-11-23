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
  trustProxy: 0,
};

async function start(
  ping: () => Promise<void>,
  cfg: AppConfig = config,
): Promise<{ app: INestApplication; url: string }> {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: PrismaService, useValue: { ping } }],
  }).compile();
  const app = moduleRef.createNestApplication();
  setupApp(app, cfg);
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

    it('laisse passer les en-têtes dont l’interface a besoin, et seulement eux', async () => {
      // Le navigateur demande d'abord la permission (préambule) avant d'envoyer l'en-tête.
      // `x-player-token` : suivi de l'inscription d'un joueur sans compte. Sans lui, la page
      // publique ne peut pas lire le statut du joueur (bug trouvé à l'essai réel).
      const preflight = (headers: string) =>
        fetch(`${url}/health`, {
          method: 'OPTIONS',
          headers: {
            origin: config.webOrigin,
            'access-control-request-method': 'DELETE',
            'access-control-request-headers': headers,
          },
        });
      const allowed = await preflight('x-player-token, content-type, x-csrf-token');
      const list = (allowed.headers.get('access-control-allow-headers') ?? '').toLowerCase();
      for (const name of ['x-player-token', 'content-type', 'x-csrf-token']) {
        expect(list).toContain(name);
      }
      // Pas de joker : un en-tête quelconque n'est pas annoncé comme permis.
      expect(list).not.toContain('*');
      expect(list).not.toContain('x-anything-else');
      expect(allowed.headers.get('access-control-allow-methods')).toContain('DELETE');
    });
  });

  it('ne fait confiance à aucun proxy par défaut, et à un seul quand on le demande', async () => {
    // Sans proxy de confiance, un en-tête X-Forwarded-For envoyé par un visiteur est ignoré :
    // il ne peut pas se faire passer pour une autre adresse et contourner les limites de débit.
    ({ app } = await start(() => Promise.resolve()));
    const express = (a: INestApplication) =>
      a.getHttpAdapter().getInstance() as { get: (name: string) => unknown };
    expect(express(app).get('trust proxy')).toBeFalsy();
    await app.close();

    ({ app } = await start(() => Promise.resolve(), { ...config, trustProxy: 1 }));
    expect(express(app).get('trust proxy')).toBe(1);
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
