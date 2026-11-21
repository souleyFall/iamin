import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/**
 * Jeton aléatoire de 256 bits, encodé pour un cookie ou un lien.
 * C'est la seule source de jetons de session, d'invitation et de réinitialisation.
 */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Empreinte SHA-256 d'un jeton : c'est elle qui est stockée, jamais le jeton. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Comparaison en temps constant de deux textes. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Paramètres argon2id recommandés par l'OWASP (19 Mio, 2 itérations, 1 voie).
 * L'algorithme par défaut de @node-rs/argon2 est argon2id ; un test le vérifie.
 */
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Vérifie un mot de passe. Une empreinte illisible compte comme un échec, jamais comme une erreur. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
