import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { pickLocale, translateMessage, type Locale } from './translate';

/**
 * Renvoie les messages d'erreur dans la langue demandée (`Accept-Language` : l'interface l'envoie à
 * chaque appel). Le corps garde la forme habituelle de Nest : `statusCode`, `message`, et `errors`
 * pour les champs de formulaire. Un message absent du catalogue sort tel quel, en français.
 */
@Catch(HttpException)
export class LocalizedExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    const status = exception.getStatus();
    const raw = exception.getResponse();
    const body: Record<string, unknown> =
      typeof raw === 'string' ? { statusCode: status, message: raw } : { ...raw };

    const locale = pickLocale(req.headers['accept-language']);
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
