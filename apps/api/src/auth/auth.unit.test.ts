import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../config';
import { readSessionToken, sessionCookieName } from './cookies';
import { hashPassword, newToken, safeEqual, sha256, verifyPassword } from './crypto';
import { OriginGuard, ROLES, RolesGuard } from './guards';
import { LoginThrottle } from './login-throttle';
import { parseBody, passwordSchema, platoUsernameSchema, usernameSchema } from './schemas';

const config = { webOrigin: 'http://localhost:5173' } as AppConfig;

function httpContext(request: object, handler: object = {}, cls: object = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => cls,
  } as unknown as ExecutionContext;
}

describe('crypto', () => {
  it('produit des jetons aléatoires de 256 bits, tous différents', () => {
    const tokens = new Set(Array.from({ length: 200 }, newToken));
    expect(tokens.size).toBe(200);
    expect(Buffer.from([...tokens][0] as string, 'base64url')).toHaveLength(32);
  });

  it('hache en argon2id avec les paramètres OWASP, avec un sel différent à chaque fois', async () => {
    const password = randomBytes(12).toString('hex');
    const a = await hashPassword(password);
    const b = await hashPassword(password);
    expect(a).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain(password);
  });

  it('vérifie un mot de passe, et refuse une empreinte illisible sans lever d’erreur', async () => {
    const password = randomBytes(12).toString('hex');
    const h = await hashPassword(password);
    expect(await verifyPassword(h, password)).toBe(true);
    expect(await verifyPassword(h, randomBytes(12).toString('hex'))).toBe(false);
    expect(await verifyPassword('pas une empreinte', 'x')).toBe(false);
  });

  it('calcule une empreinte SHA-256 stable et compare en temps constant', () => {
    expect(sha256('a')).toBe('ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb');
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('cookies', () => {
  it('utilise le préfixe __Host- seulement avec HTTPS', () => {
    expect(sessionCookieName({ sessionCookieSecure: true })).toBe('__Host-iamin_session');
    expect(sessionCookieName({ sessionCookieSecure: false })).toBe('iamin_session');
  });

  it('lit le cookie de session parmi d’autres, ignore le reste', () => {
    const c = { sessionCookieSecure: false };
    expect(readSessionToken('a=1; iamin_session=abc123; b=2', c)).toBe('abc123');
    expect(readSessionToken('a=1', c)).toBeUndefined();
    expect(readSessionToken(undefined, c)).toBeUndefined();
    expect(readSessionToken(`iamin_session=${'x'.repeat(500)}`, c)).toBeUndefined();
  });

  it('n’accepte pas le cookie sans préfixe quand HTTPS est exigé', () => {
    expect(readSessionToken('iamin_session=abc', { sessionCookieSecure: true })).toBeUndefined();
  });
});

describe('schemas', () => {
  it('normalise l’identifiant en minuscules et refuse les caractères douteux', () => {
    expect(usernameSchema.parse('  Souley.F ')).toBe('souley.f');
    for (const bad of ['ab', 'a b c', 'é_é_é', 'x'.repeat(33), '<script>']) {
      expect(usernameSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('exige 12 à 128 caractères pour un mot de passe', () => {
    expect(passwordSchema.safeParse('x'.repeat(11)).success).toBe(false);
    expect(passwordSchema.safeParse('x'.repeat(12)).success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(129)).success).toBe(false);
  });

  it('refuse un pseudo Plato avec retour à la ligne ou caractère de contrôle', () => {
    expect(platoUsernameSchema.safeParse('Zoé_92').success).toBe(true);
    expect(platoUsernameSchema.safeParse('a\nb').success).toBe(false);
    expect(platoUsernameSchema.safeParse('a‮b').success).toBe(false);
  });

  it('ne renvoie jamais la valeur reçue dans l’erreur de validation', () => {
    const received = randomBytes(3).toString('hex'); // 6 caractères : trop court
    let caught: unknown;
    try {
      parseBody(passwordSchema, received);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect(JSON.stringify((caught as BadRequestException).getResponse())).not.toContain(received);
  });
});

describe('LoginThrottle', () => {
  it('bloque un compte après trop d’échecs, puis le libère après la fenêtre', () => {
    const t = new LoginThrottle(3, 1000);
    for (let i = 0; i < 3; i++) t.recordFailure('a', 0);
    expect(t.isLocked('a', 500)).toBe(true);
    expect(t.isLocked('b', 500)).toBe(false);
    expect(t.isLocked('a', 1000)).toBe(false);
  });

  it('se remet à zéro après une connexion réussie', () => {
    const t = new LoginThrottle(2, 1000);
    t.recordFailure('a', 0);
    t.recordFailure('a', 0);
    t.reset('a');
    expect(t.isLocked('a', 1)).toBe(false);
  });

  it('borne sa mémoire', () => {
    const t = new LoginThrottle(5, 60_000, 10);
    for (let i = 0; i < 100; i++) t.recordFailure(`k${i}`, i);
    let tracked = 0;
    for (let i = 0; i < 100; i++) if (t.isLocked(`k${i}`, 200)) tracked++;
    expect(tracked).toBe(0);
  });
});

describe('OriginGuard', () => {
  const guard = new OriginGuard(config);

  it('laisse passer les lectures, quelle que soit l’origine', () => {
    expect(
      guard.canActivate(httpContext({ method: 'GET', headers: { origin: 'https://x' } })),
    ).toBe(true);
  });

  it('laisse passer une écriture sans Origin (client hors navigateur) ou depuis l’interface', () => {
    expect(guard.canActivate(httpContext({ method: 'POST', headers: {} }))).toBe(true);
    expect(
      guard.canActivate(httpContext({ method: 'POST', headers: { origin: config.webOrigin } })),
    ).toBe(true);
  });

  it('refuse une écriture venant d’une autre origine', () => {
    expect(() =>
      guard.canActivate(
        httpContext({ method: 'POST', headers: { origin: 'https://evil.example' } }),
      ),
    ).toThrow(/Origine/);
    expect(() =>
      guard.canActivate(httpContext({ method: 'DELETE', headers: { origin: 'null' } })),
    ).toThrow(/Origine/);
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const handler = () => undefined;

  it('laisse passer sans @Roles, exige le bon rôle sinon', () => {
    const user = (role: string) => ({ auth: { user: { role } } });
    expect(guard.canActivate(httpContext(user('ADMIN'), handler))).toBe(true);

    Reflect.defineMetadata(ROLES, ['PLATFORM_OWNER'], handler);
    expect(guard.canActivate(httpContext(user('PLATFORM_OWNER'), handler))).toBe(true);
    expect(() => guard.canActivate(httpContext(user('ADMIN'), handler))).toThrow(/refusé/);
    expect(() => guard.canActivate(httpContext({}, handler))).toThrow(/refusé/);
  });
});
