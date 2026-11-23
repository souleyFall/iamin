import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { Public } from '../auth/guards';
import { parseBody } from '../auth/schemas';
import { logger } from './app-logger';

/**
 * Une erreur survenue dans le navigateur (écran cassé, promesse rejetée) arrive ici pour être écrite
 * dans le journal, à côté de celles du serveur. Tout est borné et nettoyé : c'est un texte envoyé par
 * n'importe qui. Pas d'adresse IP, pas d'agent utilisateur ; la page est réduite à sa partie fixe
 * (sans paramètres ni ancre, qui peuvent contenir un lien personnel).
 */
const schema = z.object({
  kind: z.enum(['error', 'unhandledrejection', 'render']),
  message: z.string().max(300),
  stack: z.string().max(1500).optional(),
  page: z.string().max(200).optional(),
});

@Controller('public/client-errors')
export class ClientErrorsController {
  @Public()
  // Un écran qui plante en boucle ne doit pas inonder le journal.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(204)
  @Post()
  report(@Body() body: unknown): void {
    const input = parseBody(schema, body);
    logger.write('warn', 'Client', `Erreur dans le navigateur : ${input.message}`, {
      event: 'client.error',
      kind: input.kind,
      page: input.page?.split(/[?#]/)[0],
      stack: input.stack,
    });
  }
}
