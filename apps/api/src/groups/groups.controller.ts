import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { GroupRole, Role } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.controller';
import { Roles } from '../auth/guards';
import { InvitationsService } from '../auth/invitations.service';
import { groupNameSchema, parseBody } from '../auth/schemas';
import { GroupAccess, GroupGuard, type GroupRequest } from './group.guard';
import { GroupsService } from './groups.service';

const createSchema = z.object({ name: groupNameSchema });
const inviteSchema = z.object({ groupRole: z.nativeEnum(GroupRole).default(GroupRole.ADMIN) });
const idSchema = z.string().uuid();

function requireGroup(req: GroupRequest) {
  // Ne peut pas arriver : GroupGuard a posé le contexte avant d'atteindre la route.
  if (!req.group) throw new Error('Contexte de groupe absent : @GroupAccess manquant');
  return req.group;
}

@UseGuards(GroupGuard)
@Controller('groups')
export class GroupsController {
  constructor(
    @Inject(GroupsService) private readonly groups: GroupsService,
    @Inject(InvitationsService) private readonly invitations: InvitationsService,
  ) {}

  /** Un super admin crée un groupe dont il devient super admin. Le propriétaire ne crée pas de groupe. */
  @Roles(Role.GROUP_CREATOR)
  @Post()
  create(@Req() req: GroupRequest, @Body() body: unknown) {
    const { name } = parseBody(createSchema, body);
    return this.groups.create(requireAuth(req).user.id, name);
  }

  /** Mes groupes (le propriétaire de la plateforme les voit tous). */
  @Get()
  list(@Req() req: GroupRequest) {
    return this.groups.listFor(requireAuth(req));
  }

  @GroupAccess({ roles: [GroupRole.SUPER_ADMIN, GroupRole.ADMIN], allowOwner: true })
  @Get(':groupId')
  get(@Req() req: GroupRequest, @Param('groupId') groupId: string) {
    return this.groups.get(groupId, requireGroup(req));
  }

  @GroupAccess({ roles: [GroupRole.SUPER_ADMIN], allowOwner: true })
  @Post(':groupId/invitations')
  invite(@Req() req: GroupRequest, @Body() body: unknown) {
    const { groupRole } = parseBody(inviteSchema, body ?? {});
    return this.groups.invite(requireAuth(req), requireGroup(req), groupRole);
  }

  @GroupAccess({ roles: [GroupRole.SUPER_ADMIN], allowOwner: true })
  @Get(':groupId/invitations')
  listInvitations(@Req() req: GroupRequest) {
    return this.invitations.listPending(requireGroup(req).groupId);
  }

  @GroupAccess({ roles: [GroupRole.SUPER_ADMIN], allowOwner: true })
  @Delete(':groupId/invitations/:invitationId')
  async revokeInvitation(@Req() req: GroupRequest, @Param('invitationId') invitationId: string) {
    await this.invitations.revoke(requireGroup(req).groupId, parseBody(idSchema, invitationId));
  }

  @GroupAccess({ roles: [GroupRole.SUPER_ADMIN], allowOwner: true })
  @HttpCode(204)
  @Delete(':groupId/members/:userId')
  async removeMember(@Req() req: GroupRequest, @Param('userId') userId: string) {
    await this.groups.removeMember(requireGroup(req).groupId, parseBody(idSchema, userId));
  }
}
