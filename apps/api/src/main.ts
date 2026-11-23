import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';
import { ConfigError, loadConfig } from './config';
import { describeError, logger } from './logging/app-logger';

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  logger.configure(config.logLevel);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config), {
    // Les journaux de démarrage de Nest sortent dans le même format JSON que les autres.
    logger,
  });
  setupApp(app, config);
  await app.listen(config.port);
  logger.event('app.started', { port: config.port, env: config.nodeEnv }, 'info', 'Bootstrap');
}

/** Une erreur qui échappe à tout (promesse rejetée, exception) est écrite avant l'arrêt du processus. */
function fatal(event: string, error: unknown): void {
  logger.write('error', 'Process', 'Erreur fatale : le processus s’arrête', {
    event,
    ...describeError(error),
  });
  // Laisse le temps à la sortie standard de se vider avant de quitter.
  setTimeout(() => process.exit(1), 100).unref();
}
process.on('unhandledRejection', (reason) => fatal('process.unhandled_rejection', reason));
process.on('uncaughtException', (error) => fatal('process.uncaught_exception', error));
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => logger.event('app.stopping', { signal }, 'info', 'Bootstrap'));
}

bootstrap().catch((error: unknown) => {
  // Une configuration invalide s'affiche telle quelle (sans valeurs) ; le reste, avec sa trace.
  if (error instanceof ConfigError) {
    logger.write('error', 'Bootstrap', error.message, { event: 'app.config_invalid' });
  } else {
    logger.write('error', 'Bootstrap', 'Démarrage impossible', {
      event: 'app.start_failed',
      ...describeError(error),
    });
  }
  process.exit(1);
});
