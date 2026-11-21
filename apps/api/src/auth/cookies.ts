import type { Response } from 'express';
import { parse, serialize } from 'cookie';
import type { AppConfig } from '../config';

/**
 * Nom du cookie de session. Avec HTTPS, le préfixe `__Host-` oblige le navigateur à n'accepter
 * le cookie que s'il est `Secure`, sans attribut `Domain` et avec `Path=/` : un sous-domaine
 * ne peut pas en poser un faux. En local (HTTP), le préfixe serait refusé : on s'en passe.
 */
export function sessionCookieName(config: Pick<AppConfig, 'sessionCookieSecure'>): string {
  return config.sessionCookieSecure ? '__Host-iamin_session' : 'iamin_session';
}

export function readSessionToken(
  cookieHeader: string | undefined,
  config: Pick<AppConfig, 'sessionCookieSecure'>,
): string | undefined {
  if (!cookieHeader) return undefined;
  const value = parse(cookieHeader)[sessionCookieName(config)];
  return value && value.length > 0 && value.length <= 200 ? value : undefined;
}

export function setSessionCookie(
  res: Response,
  token: string,
  expiresAt: Date,
  config: Pick<AppConfig, 'sessionCookieSecure'>,
): void {
  res.append(
    'Set-Cookie',
    serialize(sessionCookieName(config), token, {
      httpOnly: true, // illisible par JavaScript : un XSS ne peut pas voler la session
      secure: config.sessionCookieSecure,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    }),
  );
}

export function clearSessionCookie(
  res: Response,
  config: Pick<AppConfig, 'sessionCookieSecure'>,
): void {
  res.append(
    'Set-Cookie',
    serialize(sessionCookieName(config), '', {
      httpOnly: true,
      secure: config.sessionCookieSecure,
      sameSite: 'lax',
      path: '/',
      expires: new Date(0),
    }),
  );
}
