import { Body, Controller, Delete, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from './auth.controller';
import { type AuthedRequest, RequireElevation, Roles } from './guards';
import { InvitationsService } from './invitations.service';
import { parseBody, platoUsernameSchema } from './schemas';

const idSchema = z.string().uuid();
const createSchema = z.object({ platoUsername: platoUsernameSchema });

/**
 * Le propriétaire de la plateforme invite des super admins : des comptes qui, seuls, peuvent créer
 * des groupes. Il ne voit rien d'autre : ni les groupes de ces comptes, ni leurs données.
 */
@Roles(Role.PLATFORM_OWNER)
@Controller('creator-invitations')
export class CreatorInvitationsController {
  constructor(@Inject(InvitationsService) private readonly invitations: InvitationsService) {}

  /** Crée un lien d'invitation (7 jours, un seul usage) à transmettre au futur super admin. */
  @RequireElevation()
  @Post()
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    // Le propriétaire sait qui il invite : le pseudo Plato est obligatoire et sera imposé.
    const { platoUsername } = parseBody(createSchema, body);
    return this.invitations.createCreator(requireAuth(req).user.id, platoUsername);
  }

  @Get()
  list() {
    return this.invitations.listPendingCreators();
  }

  @RequireElevation()
  @Delete(':invitationId')
  async revoke(@Param('invitationId') invitationId: string) {
    await this.invitations.revokeCreator(parseBody(idSchema, invitationId));
  }
}
