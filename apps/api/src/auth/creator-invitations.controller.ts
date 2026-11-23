import { Controller, Delete, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from './auth.controller';
import { type AuthedRequest, Roles } from './guards';
import { InvitationsService } from './invitations.service';
import { parseBody } from './schemas';

const idSchema = z.string().uuid();

/**
 * Le propriétaire de la plateforme invite des super admins : des comptes qui, seuls, peuvent créer
 * des groupes. Il ne voit rien d'autre : ni les groupes de ces comptes, ni leurs données.
 */
@Roles(Role.PLATFORM_OWNER)
@Controller('creator-invitations')
export class CreatorInvitationsController {
  constructor(@Inject(InvitationsService) private readonly invitations: InvitationsService) {}

  /** Crée un lien d'invitation (7 jours, un seul usage) à transmettre au futur super admin. */
  @Post()
  create(@Req() req: AuthedRequest) {
    return this.invitations.createCreator(requireAuth(req).user.id);
  }

  @Get()
  list() {
    return this.invitations.listPendingCreators();
  }

  @Delete(':invitationId')
  async revoke(@Param('invitationId') invitationId: string) {
    await this.invitations.revokeCreator(parseBody(idSchema, invitationId));
  }
}
