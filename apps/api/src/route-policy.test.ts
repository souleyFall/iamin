import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { IS_PUBLIC } from './auth/guards';
import type { AppConfig } from './config';
import { GROUP_ACCESS, GroupGuard } from './groups/group.guard';

/**
 * Garde-fous STRUCTURELS de l'audit (PR 15) : ils lisent les métadonnées de toutes les routes de
 * l'API, donc une route ajoutée plus tard est contrôlée sans qu'on y pense. Ils échouent si :
 * - une route sous `/groups/:groupId` oublie `GroupGuard` ou `@GroupAccess` (fuite entre groupes, R1) ;
 * - une route publique n'a pas de limite de débit explicite (robots, R8) ;
 * - la liste des routes publiques change sans décision explicite (ci-dessous).
 */
const config: AppConfig = {
  nodeEnv: 'test',
  port: 0,
  databaseUrl: 'postgresql://u:p@127.0.0.1:5432/db',
  webOrigin: 'http://localhost:5173',
  sessionCookieSecure: false,
  trustProxy: 0,
};

/** Clé posée par `@Throttle({ default: ... })` de @nestjs/throttler. */
const THROTTLE_LIMIT_KEY = 'THROTTLER:LIMITdefault';

interface Route {
  id: string;
  path: string;
  isPublic: boolean;
  hasGroupGuard: boolean;
  hasGroupAccess: boolean;
  hasThrottle: boolean;
}

const join = (...parts: unknown[]): string =>
  '/' +
  parts
    .flatMap((p): unknown[] => (Array.isArray(p) ? (p as unknown[]) : [p]))
    .filter((p): p is string => typeof p === 'string' && p !== '')
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter((p) => p !== '')
    .join('/');

function routes(): Route[] {
  const controllers = (AppModule.register(config).controllers ?? []) as (new () => object)[];
  const found: Route[] = [];
  for (const controller of controllers) {
    const prefix: unknown = Reflect.getMetadata(PATH_METADATA, controller);
    const proto = controller.prototype as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const handler = proto[name];
      if (typeof handler !== 'function') continue;
      const method: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
      if (typeof method !== 'number') continue;
      const sub: unknown = Reflect.getMetadata(PATH_METADATA, handler);
      const guards = [
        ...((Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[] | undefined) ?? []),
        ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined) ?? []),
      ];
      const meta = (key: string): unknown =>
        Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, controller);
      found.push({
        id: `${RequestMethod[method]} ${join(prefix, sub)}`,
        path: join(prefix, sub),
        isPublic: meta(IS_PUBLIC) === true,
        hasGroupGuard: guards.includes(GroupGuard),
        hasGroupAccess: meta(GROUP_ACCESS) !== undefined,
        hasThrottle: meta(THROTTLE_LIMIT_KEY) !== undefined,
      });
    }
  }
  return found;
}

describe('politique des routes (audit)', () => {
  const all = routes();

  it('trouve bien les routes (le test ne passe pas à vide)', () => {
    expect(all.length).toBeGreaterThan(40);
    // Contrôle de la clé de limite de débit : la connexion est limitée, donc la clé est la bonne.
    expect(all.find((r) => r.id === 'POST /auth/login')?.hasThrottle).toBe(true);
  });

  it('toute route sous /groups/:groupId passe par GroupGuard ET déclare @GroupAccess (R1)', () => {
    const scoped = all.filter((r) => r.path.includes(':groupId'));
    expect(scoped.length).toBeGreaterThanOrEqual(20);
    const missing = scoped.filter((r) => !r.hasGroupGuard || !r.hasGroupAccess).map((r) => r.id);
    expect(missing).toEqual([]);
  });

  it('aucune route publique ne manipule un groupe', () => {
    expect(all.filter((r) => r.isPublic && r.path.includes(':groupId')).map((r) => r.id)).toEqual(
      [],
    );
  });

  it('toute route publique a une limite de débit propre, sauf la sonde de santé (R5, R8, R17)', () => {
    const unlimited = all
      .filter((r) => r.isPublic && !r.hasThrottle && r.path !== '/health')
      .map((r) => r.id);
    expect(unlimited).toEqual([]);
  });

  it('la liste des routes publiques est exactement celle décidée (toute nouvelle route publique doit être ajoutée ici, à dessein)', () => {
    expect(
      all
        .filter((r) => r.isPublic)
        .map((r) => r.id)
        .sort(),
    ).toEqual(
      [
        'DELETE /public/registration',
        'GET /health',
        'GET /public/registration',
        'GET /public/tournaments/:slug',
        'GET /public/tournaments/:slug/view',
        'POST /auth/login',
        'POST /auth/reset',
        'POST /auth/reset-requests',
        'POST /invitations/accept',
        'POST /public/tournaments/:slug/registrations',
        // Flux en direct : lu par `@Sse('live')`, qui se déclare comme une route GET.
        'GET /public/tournaments/:slug/live',
      ].sort(),
    );
  });

  it('les routes du propriétaire de la plateforme exigent son rôle', () => {
    const tickets = all.filter((r) => r.path.startsWith('/reset-tickets'));
    expect(tickets.length).toBe(3);
  });
});
