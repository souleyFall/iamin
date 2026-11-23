import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { AppConfig } from './config';

/**
 * Réglages de sécurité communs à l'API réelle et aux tests :
 * en-têtes de sécurité, CORS limité à l'origine de l'interface, signature du serveur masquée.
 */
export function setupApp(app: INestApplication, config: AppConfig): void {
  (app as NestExpressApplication).disable('x-powered-by');
  app.use(helmet());
  app.enableCors({
    origin: config.webOrigin, // une seule origine exacte, jamais `*`
    credentials: true, // le cookie de session accompagne les appels de l'interface
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    // `x-player-token` : le lien personnel d'un joueur sans compte (suivi et annulation de son inscription).
    allowedHeaders: ['content-type', 'x-csrf-token', 'x-player-token'],
    maxAge: 600,
  });
  app.enableShutdownHooks();
}
