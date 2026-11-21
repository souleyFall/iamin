import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';
import { ConfigError, loadConfig } from './config';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const config = loadConfig(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config));
  setupApp(app, config);
  await app.listen(config.port);
  logger.log(`API prête sur le port ${config.port} (${config.nodeEnv})`);
}

bootstrap().catch((error: unknown) => {
  // Une configuration invalide s'affiche telle quelle ; le reste, avec sa trace.
  console.error(error instanceof ConfigError ? error.message : error);
  process.exit(1);
});
