import { Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from './config';
import { APP_CONFIG } from './config.token';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma.service';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [{ provide: APP_CONFIG, useValue: config }, PrismaService],
    };
  }
}
