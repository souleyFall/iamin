/**
 * Outils des tests d'intégration : une vraie API contre une vraie base PostgreSQL de test.
 * Ce fichier n'est pas compilé dans `dist` (voir tsconfig.build.json).
 */
import { randomBytes } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, type Role } from '@prisma/client';
import { AppModule } from '../app.module';
import { setupApp } from '../app.setup';
import type { AppConfig } from '../config';
import { hashPassword } from './crypto';

export const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export const WEB_ORIGIN = 'http://localhost:5173';

/**
 * Mot de passe de test tiré au hasard à chaque exécution : aucun mot de passe écrit en dur dans
 * le dépôt (les détecteurs de secrets ne distinguent pas un exemple d'un vrai mot de passe).
 */
export const randomPassword = (): string => `pw-${randomBytes(12).toString('hex')}`;

/**
 * Garde-fou : les tests vident les tables. Ils refusent de tourner si le nom de la base
 * ne se termine pas par `_test`, pour ne jamais effacer une vraie base par erreur.
 */
export function assertTestDatabase(url: string): void {
  if (!/\/[^/?]*_test(\?|$)/.test(url)) {
    throw new Error('TEST_DATABASE_URL doit viser une base dont le nom se termine par « _test ».');
  }
}

export interface TestApp {
  app: INestApplication;
  url: string;
  prisma: PrismaClient;
  config: AppConfig;
  close: () => Promise<void>;
}

export async function startApp(overrides: Partial<AppConfig> = {}): Promise<TestApp> {
  if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL n’est pas défini.');
  assertTestDatabase(testDatabaseUrl);
  const config: AppConfig = {
    nodeEnv: 'test',
    port: 0,
    databaseUrl: testDatabaseUrl,
    webOrigin: WEB_ORIGIN,
    sessionCookieSecure: false,
    ...overrides,
  };
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(config)],
  }).compile();
  const app = moduleRef.createNestApplication();
  setupApp(app, config);
  await app.listen(0);
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  return {
    app,
    url: await app.getUrl(),
    prisma,
    config,
    close: async () => {
      await app.close();
      await prisma.$disconnect();
    },
  };
}

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Session", "Invitation", "ResetTicket", "GroupMember", "Group", "User" RESTART IDENTITY CASCADE',
  );
}

export async function createUser(
  prisma: PrismaClient,
  input: { username: string; password: string; role: Role; platoUsername?: string },
) {
  return prisma.user.create({
    data: {
      username: input.username,
      platoUsername: input.platoUsername ?? input.username,
      passwordHash: await hashPassword(input.password),
      role: input.role,
    },
  });
}

export interface Reply {
  status: number;
  body: unknown;
  headers: Headers;
  setCookies: string[];
}

/** Un « navigateur » minimal : garde le cookie de session et le jeton CSRF entre les appels. */
export class Client {
  cookie: string | undefined;
  csrfToken: string | undefined;

  constructor(
    private readonly baseUrl: string,
    /** `undefined` : aucun en-tête Origin (curl, tests) ; sinon l'origine envoyée comme un navigateur. */
    private readonly origin: string | undefined = WEB_ORIGIN,
  ) {}

  async request(
    method: string,
    path: string,
    body?: unknown,
    options: { csrf?: boolean; origin?: string | null } = {},
  ): Promise<Reply> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (this.cookie) headers.cookie = this.cookie;
    const origin = options.origin === undefined ? this.origin : (options.origin ?? undefined);
    if (origin) headers.origin = origin;
    if ((options.csrf ?? true) && this.csrfToken) headers['x-csrf-token'] = this.csrfToken;

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookies = res.headers.getSetCookie();
    for (const line of setCookies) {
      const [pair = ''] = line.split(';');
      const [name = '', value = ''] = pair.split('=');
      if (value === '') this.cookie = undefined;
      else this.cookie = `${name}=${value}`;
    }
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text === '' ? undefined : JSON.parse(text);
    } catch {
      // Réponse qui n'est pas du JSON : on la garde telle quelle.
    }
    return { status: res.status, body: parsed, headers: res.headers, setCookies };
  }

  /** Se connecte et mémorise cookie et jeton CSRF. */
  async login(username: string, password: string): Promise<Reply> {
    const reply = await this.request('POST', '/auth/login', { username, password });
    const body = reply.body as { csrfToken?: string } | undefined;
    if (reply.status === 200 && body?.csrfToken) this.csrfToken = body.csrfToken;
    return reply;
  }
}
