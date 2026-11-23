import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from './app-logger';
import { runWithContext, type RequestContext } from './context';

/** La sonde de santé tourne toutes les dix secondes : la journaliser noierait le reste. */
const QUIET_PATHS = new Set(['/health']);

/** La route du gestionnaire (`/groups/:groupId`), jamais l'adresse réelle. */
export function routeOf(req: Request): string {
  const path = (req.route as { path?: unknown } | undefined)?.path;
  return typeof path === 'string' ? `${req.baseUrl}${path}` : 'route inconnue';
}

/**
 * Pour chaque requête : un identifiant (renvoyé dans l'en-tête `x-request-id`, repris dans toutes
 * les lignes de journal écrites pendant la requête) et une ligne de fin avec le statut et la durée.
 *
 * On écrit la route (`/groups/:groupId/tournaments`), jamais l'adresse réelle : elle contient des
 * identifiants, des liens de joueurs ou des jetons. Ni adresse IP, ni en-têtes, ni corps (D21, D28).
 */
export function requestLog(req: Request, res: Response, next: NextFunction): void {
  const ctx: RequestContext = { reqId: randomUUID() };
  res.setHeader('x-request-id', ctx.reqId);
  const started = process.hrtime.bigint();
  let done = false;

  const finish = (aborted: boolean): void => {
    if (done) return;
    done = true;
    if (QUIET_PATHS.has(req.path) && res.statusCode < 400) return;
    const route = routeOf(req);
    const status = res.statusCode;
    const level = aborted || status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    const failure = res.locals as { errorMessage?: string; errorCode?: string };
    runWithContext(ctx, () =>
      logger.write(level, 'Http', `${req.method} ${route} ${status}`, {
        event: 'http.request',
        method: req.method,
        route,
        status,
        durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
        ...(aborted ? { aborted: true } : {}),
        ...(failure.errorMessage ? { error: failure.errorMessage } : {}),
        ...(failure.errorCode ? { errorCode: failure.errorCode } : {}),
        ...(ctx.role ? { role: ctx.role } : {}),
      }),
    );
  };

  res.on('finish', () => finish(false));
  // Connexion coupée avant la fin de la réponse (le direct SSE se ferme ainsi, sans être une erreur).
  res.on('close', () => finish(!res.writableFinished && res.statusCode >= 500));
  runWithContext(ctx, next);
}
