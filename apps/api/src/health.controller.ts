import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './auth/guards';
import { PrismaService } from './prisma.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Sonde de santé : l'API répond et la base aussi.
   * Elle ne révèle rien sur la configuration ni sur la cause d'une panne.
   */
  @Public()
  @Get()
  async check(): Promise<{ status: 'ok'; db: 'up' }> {
    try {
      await this.prisma.ping();
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: 'down' });
    }
    return { status: 'ok', db: 'up' };
  }
}
