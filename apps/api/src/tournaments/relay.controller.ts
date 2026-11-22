import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { GroupRole } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.controller';
import { parseBody } from '../auth/schemas';
import { GroupAccess, GroupGuard, type GroupRequest } from '../groups/group.guard';
import { EventsService } from './events.service';
import { RelayService } from './relay.service';

const idSchema = z.string().uuid();
const offerSchema = z.object({ toUserId: idSchema });
const eventsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: idSchema.optional(),
});

function contextOf(req: GroupRequest) {
  if (!req.group) throw new Error('Contexte de groupe absent : @GroupAccess manquant');
  return { groupId: req.group.groupId, role: req.group.role, userId: requireAuth(req).user.id };
}

/**
 * Relais et journal d'un tournoi. Tout admin du groupe lit le journal ; les routes de relais
 * vérifient en plus, dans le service, qui peut faire quoi. Même protection que les autres routes
 * de tournoi : membre du groupe uniquement, propriétaire de la plateforme exclu.
 */
@UseGuards(GroupGuard)
@GroupAccess({ roles: [GroupRole.SUPER_ADMIN, GroupRole.ADMIN] })
@Controller('groups/:groupId/tournaments/:tournamentId')
export class RelayController {
  constructor(
    @Inject(RelayService) private readonly relay: RelayService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  @HttpCode(200)
  @Post('relay/take')
  take(@Req() req: GroupRequest, @Param('tournamentId') id: string) {
    const c = contextOf(req);
    return this.relay.take(c.groupId, c.userId, c.role, parseBody(idSchema, id));
  }

  @HttpCode(200)
  @Post('relay/release')
  release(@Req() req: GroupRequest, @Param('tournamentId') id: string) {
    const c = contextOf(req);
    return this.relay.release(c.groupId, c.userId, parseBody(idSchema, id));
  }

  @HttpCode(200)
  @Post('relay/offer')
  offer(@Req() req: GroupRequest, @Param('tournamentId') id: string, @Body() body: unknown) {
    const c = contextOf(req);
    const { toUserId } = parseBody(offerSchema, body);
    return this.relay.offer(c.groupId, c.userId, parseBody(idSchema, id), toUserId);
  }

  @Delete('relay/offer')
  cancelOffer(@Req() req: GroupRequest, @Param('tournamentId') id: string) {
    const c = contextOf(req);
    return this.relay.cancelOffer(c.groupId, c.userId, parseBody(idSchema, id));
  }

  @HttpCode(200)
  @Post('relay/accept')
  accept(@Req() req: GroupRequest, @Param('tournamentId') id: string) {
    const c = contextOf(req);
    return this.relay.accept(c.groupId, c.userId, parseBody(idSchema, id));
  }

  @HttpCode(200)
  @Post('relay/decline')
  decline(@Req() req: GroupRequest, @Param('tournamentId') id: string) {
    const c = contextOf(req);
    return this.relay.decline(c.groupId, c.userId, parseBody(idSchema, id));
  }

  /** Journal du tournoi, du plus récent au plus ancien (`before` : curseur de la page précédente). */
  @Get('events')
  list(@Req() req: GroupRequest, @Param('tournamentId') id: string, @Query() query: unknown) {
    const c = contextOf(req);
    const { limit, before } = parseBody(eventsQuery, query);
    return this.events.list(c.groupId, parseBody(idSchema, id), limit, before);
  }
}
