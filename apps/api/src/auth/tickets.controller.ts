import { Controller, Get, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { Roles } from './guards';
import { ResetService } from './reset.service';
import { parseBody } from './schemas';

const idSchema = z.string().uuid();

/** Tickets de réinitialisation de mot de passe : tableau de bord du propriétaire de la plateforme. */
@Roles(Role.PLATFORM_OWNER)
@Controller('reset-tickets')
export class TicketsController {
  constructor(@Inject(ResetService) private readonly reset: ResetService) {}

  @Get()
  list() {
    return this.reset.listActive();
  }

  /** Émet (ou remplace) le lien à usage unique à transmettre à la personne, par Plato. */
  @Post(':id/issue')
  issue(@Param('id') id: string) {
    return this.reset.issue(parseBody(idSchema, id));
  }

  @HttpCode(204)
  @Post(':id/close')
  async close(@Param('id') id: string) {
    await this.reset.close(parseBody(idSchema, id));
  }
}
