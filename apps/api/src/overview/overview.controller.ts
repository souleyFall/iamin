import { Controller, Get, Inject, Query } from '@nestjs/common';
import { Role, TournamentFormat, TournamentStatus } from '@prisma/client';
import { z } from 'zod';
import { Roles } from '../auth/guards';
import { parseBody } from '../auth/schemas';
import { OverviewService } from './overview.service';

const filterSchema = z
  .object({
    status: z.nativeEnum(TournamentStatus).optional(),
    format: z.nativeEnum(TournamentFormat).optional(),
    groupId: z.string().uuid().optional(),
    q: z.string().trim().max(80).optional(),
    before: z.string().uuid().optional(),
  })
  .strict();

/**
 * Tableau de bord du propriétaire de la plateforme (D30). Seulement des lectures (`GET`) : un test de
 * politique des routes refuse toute autre méthode ici.
 */
@Roles(Role.PLATFORM_OWNER)
@Controller('overview')
export class OverviewController {
  constructor(@Inject(OverviewService) private readonly overview: OverviewService) {}

  @Get()
  summary() {
    return this.overview.summary();
  }

  @Get('tournaments')
  tournaments(@Query() query: unknown) {
    return this.overview.tournaments(parseBody(filterSchema, query));
  }
}
