import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { LogLevelSetting } from './logging/app-logger';

/**
 * Configuration lue dans l'environnement et validée au démarrage : une variable manquante ou
 * mal formée arrête l'API tout de suite, avec un message clair, plutôt que de casser plus tard.
 */
const booleanFromText = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL est obligatoire')
    .refine((url) => /^postgres(ql)?:\/\//.test(url), 'DATABASE_URL doit être une URL PostgreSQL'),
  WEB_ORIGIN: z
    .string()
    .min(1, 'WEB_ORIGIN est obligatoire')
    .refine((value) => {
      try {
        // Une origine, rien d'autre : pas de chemin, pas de `*`.
        return new URL(value).origin === value;
      } catch {
        return false;
      }
    }, 'WEB_ORIGIN doit être une origine exacte, par exemple http://localhost:5173'),
  SESSION_COOKIE_SECURE: booleanFromText.default(false),
  // Nombre de proxys de confiance devant l'API (0 = aucun). Derrière Caddy : 1. Sans ce réglage,
  // toutes les limites de débit (par IP) compteraient l'adresse du proxy, donc un seul « visiteur ».
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  // Clé (32 octets en hexadécimal) qui chiffre les secrets de double authentification en base.
  // Obligatoire en production ; en développement et en test une clé fixe, publique, sert de repli.
  TOTP_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'doit faire 64 caractères hexadécimaux (openssl rand -hex 32)')
    .optional(),
  // Niveau minimal du journal. Par défaut : « info » (« silent » en test, pour des tests lisibles).
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).optional(),
});

/** Clé de repli hors production : connue de tous, donc sans aucune valeur de protection. */
const DEV_TOTP_KEY = createHash('sha256').update('iamin-developpement-seulement').digest();

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  webOrigin: string;
  sessionCookieSecure: boolean;
  trustProxy: number;
  /** Clé AES-256 des secrets de double authentification. */
  totpEncryptionKey: Buffer;
  /** Niveau minimal du journal (voir logging/app-logger.ts). */
  logLevel: LogLevelSetting;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    // Seuls les noms de variables et les raisons sont affichés, jamais leurs valeurs.
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'configuration'} : ${issue.message}`)
      .join('\n');
    throw new ConfigError(`Configuration invalide :\n${problems}`);
  }
  const c = parsed.data;
  if (c.NODE_ENV === 'production' && !c.SESSION_COOKIE_SECURE) {
    throw new ConfigError(
      'Configuration invalide :\nSESSION_COOKIE_SECURE : doit être « true » en production (HTTPS)',
    );
  }
  if (c.NODE_ENV === 'production' && !c.TOTP_ENCRYPTION_KEY) {
    throw new ConfigError(
      'Configuration invalide :\nTOTP_ENCRYPTION_KEY : obligatoire en production (openssl rand -hex 32)',
    );
  }
  return {
    nodeEnv: c.NODE_ENV,
    port: c.PORT,
    databaseUrl: c.DATABASE_URL,
    webOrigin: c.WEB_ORIGIN,
    sessionCookieSecure: c.SESSION_COOKIE_SECURE,
    trustProxy: c.TRUST_PROXY,
    totpEncryptionKey: c.TOTP_ENCRYPTION_KEY
      ? Buffer.from(c.TOTP_ENCRYPTION_KEY, 'hex')
      : DEV_TOTP_KEY,
    logLevel: c.LOG_LEVEL ?? (c.NODE_ENV === 'test' ? 'silent' : 'info'),
  };
}
