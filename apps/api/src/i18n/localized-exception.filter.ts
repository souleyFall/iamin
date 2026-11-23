import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { describeError, logger } from '../logging/app-logger';
import { routeOf } from '../logging/request-log.middleware';
import { pickLocale, translateMessage, type Locale } from './translate';

/** Message d'un 500 : jamais le détail interne (traduit par le catalogue, comme les autres). */
const INTERNAL_ERROR = 'Erreur interne du serveur';

/**
 * Renvoie les messages d'erreur dans la langue demandée (`Accept-Language` : l'interface l'envoie à
 * chaque appel). Le corps garde la forme habituelle de Nest : `statusCode`, `message`, et `errors`
 * pour les champs de formulaire. Un message absent du catalogue sort tel quel, en français.
 *
 * Il attrape aussi toute erreur inattendue (bug, base injoignable) : le visiteur reçoit un 500 sans
 * détail interne, et l'erreur complète (nom, code, trace) part dans le journal avec l'identifiant de
 * la requête, que l'interface affiche pour qu'on la retrouve (`x-request-id`).
 */
@Catch()
export class LocalizedExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const locale = pickLocale(req.headers['accept-language']);

    const known = exception instanceof HttpException;
    const status = known ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = known ? exception.getResponse() : INTERNAL_ERROR;
    const body: Record<string, unknown> =
      typeof raw === 'string' ? { statusCode: status, message: raw } : { ...raw };

    // Le texte d'origine (français) et le code machine vont au journal avant la traduction.
    const original = body.message;
    const failure = res.locals as { errorMessage?: string; errorCode?: string };
    if (known && status < 500) {
      const text = Array.isArray(original)
        ? original.filter((m): m is string => typeof m === 'string').join(' ; ')
        : typeof original === 'string'
          ? original
          : undefined;
      // « Cannot GET /adresse/avec/jeton » : Nest recopie l'adresse demandée, qu'on ne journalise pas.
      failure.errorMessage = text?.replace(/^Cannot (\w+) .*$/, 'Cannot $1 (route inconnue)');
      if (typeof body.code === 'string') failure.errorCode = body.code;
    } else {
      // 5xx : une erreur du serveur, journalisée en entier (une seule fois, ici).
      const route = routeOf(req);
      logger.write('error', 'Http', `${req.method} ${route} : erreur ${status}`, {
        event: 'http.error',
        method: req.method,
        route,
        status,
        ...describeError(exception),
      });
    }

    const message = body.message;
    if (typeof message === 'string') body.message = translateMessage(message, locale);
    else if (Array.isArray(message)) {
      body.message = (message as unknown[]).map((m): unknown =>
        typeof m === 'string' ? translateMessage(m, locale) : m,
      );
    }
    if (Array.isArray(body.errors)) body.errors = translateFields(body.errors, locale);

    // Un flux déjà commencé (direct SSE) ne peut plus recevoir de corps : on le ferme.
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(status).json(body);
  }
}

function translateFields(errors: unknown[], locale: Locale): unknown[] {
  return errors.map((e) => {
    if (typeof e !== 'object' || e === null) return e;
    const field = e as { message?: unknown };
    return typeof field.message === 'string'
      ? { ...field, message: translateMessage(field.message, locale) }
      : e;
  });
}
