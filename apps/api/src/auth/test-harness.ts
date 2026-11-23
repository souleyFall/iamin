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
import * as OTPAuth from 'otpauth';
import { encryptSecret, hashPassword } from './crypto';

/** Clé de chiffrement des secrets TOTP des tests : fixe, sans valeur hors des tests. */
export const TEST_TOTP_KEY = Buffer.alloc(32, 7);

/** Secrets TOTP des comptes de test (identifiant -> base32) : le « téléphone » du propriétaire. */
const mfaSecrets = new Map<string, string>();
let activePrisma: PrismaClient | undefined;

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
    trustProxy: 0,
    totpEncryptionKey: TEST_TOTP_KEY,
    logLevel: 'silent',
    ...overrides,
  };
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(config)],
  }).compile();
  const app = moduleRef.createNestApplication();
  setupApp(app, config);
  await app.listen(0);
  const prisma = new PrismaClient({ datasourceUrl: testDatabaseUrl });
  activePrisma = prisma;
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
    'TRUNCATE TABLE "Session", "Invitation", "ResetTicket", "MatchResult", "Registration", "Tournament", "GroupMember", "Group", "Feedback", "User" RESTART IDENTITY CASCADE',
  );
}

/**
 * Crée un compte. Le propriétaire a la double authentification active (elle est obligatoire) : le
 * test la passe seul via Client.login. mfa: false crée un propriétaire sans, pour tester son
 * activation ; mfa: true en active une sur un autre compte.
 */
export async function createUser(
  prisma: PrismaClient,
  input: {
    username: string;
    password: string;
    role: Role;
    platoUsername?: string;
    mfa?: boolean;
  },
) {
  const withMfa = input.mfa ?? input.role === 'PLATFORM_OWNER';
  const secret = withMfa ? new OTPAuth.Secret({ size: 20 }) : undefined;
  const user = await prisma.user.create({
    data: {
      username: input.username,
      platoUsername: input.platoUsername ?? input.username,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      ...(secret
        ? {
            totpSecretEnc: encryptSecret(TEST_TOTP_KEY, secret.base32),
            totpEnabledAt: new Date(),
          }
        : {}),
    },
  });
  if (secret) mfaSecrets.set(input.username, secret.base32);
  return user;
}

/** Code à 6 chiffres que l'application du compte afficherait maintenant (stepOffset : 30 s par cran). */
export function totpCodeFor(username: string, stepOffset = 0, now = Date.now()): string {
  const base32 = mfaSecrets.get(username);
  if (!base32) throw new Error('Pas de secret TOTP de test pour ' + username);
  const totp = new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32),
  });
  return totp.generate({ timestamp: now + stepOffset * 30_000 });
}

/** Mémorise le secret d'un compte activé par l'API (le test le lit dans la réponse de setup). */
export function rememberTotpSecret(username: string, base32: string): void {
  mfaSecrets.set(username, base32);
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
    options: { csrf?: boolean; origin?: string | null; headers?: Record<string, string> } = {},
  ): Promise<Reply> {
    const headers: Record<string, string> = { ...options.headers };
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

  /**
   * Se connecte et mémorise cookie et jeton CSRF. Si le compte a la double authentification et que
   * le test en connaît le secret, la seconde étape est faite ici avec un code valide.
   */
  async login(
    username: string,
    password: string,
    headers: Record<string, string> = {},
  ): Promise<Reply> {
    let reply = await this.request('POST', '/auth/login', { username, password }, { headers });
    const first = reply.body as { mfaRequired?: boolean; challenge?: string } | undefined;
    if (
      reply.status === 200 &&
      first?.mfaRequired &&
      first.challenge &&
      mfaSecrets.has(username.toLowerCase())
    ) {
      // Un code ne sert qu'une fois : on oublie la dernière tranche vue pour pouvoir se reconnecter
      // plusieurs fois dans les 30 secondes d'un même test.
      await activePrisma?.user.update({
        where: { username: username.toLowerCase() },
        data: { totpLastStep: null },
      });
      reply = await this.request(
        'POST',
        '/auth/login/mfa',
        { challenge: first.challenge, code: totpCodeFor(username.toLowerCase()) },
        { headers },
      );
    }
    const body = reply.body as { csrfToken?: string } | undefined;
    if (reply.status === 200 && body?.csrfToken) this.csrfToken = body.csrfToken;
    return reply;
  }
}
