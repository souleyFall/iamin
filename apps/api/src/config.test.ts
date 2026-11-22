import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

const valid = {
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/db',
  WEB_ORIGIN: 'http://localhost:5173',
};

describe('loadConfig', () => {
  it('applique les valeurs par défaut', () => {
    expect(loadConfig(valid)).toEqual({
      nodeEnv: 'development',
      port: 3000,
      databaseUrl: valid.DATABASE_URL,
      webOrigin: valid.WEB_ORIGIN,
      sessionCookieSecure: false,
    });
  });

  it('lit les valeurs fournies', () => {
    const c = loadConfig({
      ...valid,
      PORT: '4000',
      NODE_ENV: 'test',
      SESSION_COOKIE_SECURE: 'true',
    });
    expect(c).toMatchObject({ port: 4000, nodeEnv: 'test', sessionCookieSecure: true });
  });

  it('refuse une configuration sans base ni origine', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({})).toThrow(/WEB_ORIGIN/);
  });

  it('refuse une URL de base qui n’est pas PostgreSQL', () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: 'mysql://x' })).toThrow(/PostgreSQL/);
  });

  it.each(['*', 'http://localhost:5173/', 'http://localhost:5173/app', 'localhost:5173', ''])(
    'refuse l’origine %j (CORS strict : une origine exacte)',
    (origin) => {
      expect(() => loadConfig({ ...valid, WEB_ORIGIN: origin })).toThrow(ConfigError);
    },
  );

  it('refuse un port invalide', () => {
    expect(() => loadConfig({ ...valid, PORT: '0' })).toThrow(/PORT/);
    expect(() => loadConfig({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('exige un cookie Secure en production', () => {
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production' })).toThrow(/SESSION_COOKIE_SECURE/);
    expect(
      loadConfig({ ...valid, NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'true' }).nodeEnv,
    ).toBe('production');
  });

  it('n’affiche jamais les valeurs dans le message d’erreur', () => {
    const secret = 'mysql://utilisateur:mot-de-passe-secret@hote/db';
    try {
      loadConfig({ ...valid, DATABASE_URL: secret });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain('mot-de-passe-secret');
    }
  });
});
