import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { AppConfig } from './config';
import { logger } from './logging/app-logger';
import { requestLog } from './logging/request-log.middleware';

/**
 * Réglages de sécurité communs à l'API réelle et aux tests :
 * en-têtes de sécurité, CORS limité à l'origine de l'interface, signature du serveur masquée.
 */
export function setupApp(app: INestApplication, config: AppConfig): void {
  (app as NestExpressApplication).disable('x-powered-by');
  // Adresse du visiteur = celle que le proxy de confiance a vue, jamais un en-tête qu'il envoie
  // lui-même (sinon n'importe qui contournerait les limites de débit en changeant d'« adresse »).
  if (config.trustProxy > 0) (app as NestExpressApplication).set('trust proxy', config.trustProxy);
  // Journal : niveau choisi par LOG_LEVEL, format JSON, un identifiant par requête (D28).
  logger.configure(config.logLevel);
  app.useLogger(logger);
  app.use(requestLog);
  app.use(helmet());
  app.enableCors({
    // Lisible par l'interface même d'une autre origine (développement) : elle l'affiche en cas d'erreur.
    exposedHeaders: ['x-request-id'],
    origin: config.webOrigin, // une seule origine exacte, jamais `*`
    credentials: true, // le cookie de session accompagne les appels de l'interface
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    // `x-player-token` : le lien personnel d'un joueur sans compte (suivi et annulation de son inscription).
    allowedHeaders: ['content-type', 'x-csrf-token', 'x-player-token'],
    maxAge: 600,
  });
  app.enableShutdownHooks();
}
