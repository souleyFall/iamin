import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** Identifiant de connexion : minuscules, chiffres, `.`, `_` et `-`. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, '3 à 32 caractères : lettres, chiffres, point, tiret ou souligné');

/** 12 caractères au moins (recommandation de l'OWASP sans règles de composition), 128 au plus. */
export const passwordSchema = z
  .string()
  .min(12, '12 caractères au minimum')
  .max(128, '128 caractères au maximum');

/** Longueur minimale du mot de passe du propriétaire de la plateforme (12 pour les autres comptes). */
export const OWNER_PASSWORD_MIN = 16;

/**
 * Règles en plus pour le compte propriétaire : 16 caractères au moins, et pas son identifiant ni son
 * pseudo Plato (ce que quelqu'un essaierait en premier). `null` si le mot de passe convient.
 */
export function ownerPasswordProblem(username: string, password: string): string | null {
  if (password.length < OWNER_PASSWORD_MIN) {
    return `${OWNER_PASSWORD_MIN} caractères au moins pour le propriétaire`;
  }
  if (password.toLowerCase().includes(username.toLowerCase())) {
    return 'Le mot de passe ne doit pas contenir ton identifiant';
  }
  return null;
}

export const platoUsernameSchema = z
  .string()
  .trim()
  .min(1, 'Le pseudo Plato est obligatoire')
  .max(64, '64 caractères au maximum')
  // Pas de caractère de contrôle : le pseudo est recopié dans des messages de chat.
  .refine((v) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(v), 'Caractères non autorisés');

/** Nom d'un groupe : affiché dans les textes copiés dans le chat, donc sans caractère de contrôle. */
export const groupNameSchema = z
  .string()
  .trim()
  .min(2, '2 caractères au minimum')
  .max(60, '60 caractères au maximum')
  .refine((v) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(v), 'Caractères non autorisés');

export const tokenSchema = z.string().min(20).max(200);

/**
 * Valide un corps de requête. En cas d'erreur, la réponse liste les champs et les raisons,
 * jamais les valeurs reçues (un mot de passe mal formé ne doit pas revenir dans une réponse).
 */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      message: 'Données invalides',
      errors: result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
  }
  return result.data;
}
