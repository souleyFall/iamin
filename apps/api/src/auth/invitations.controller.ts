import { Body, Controller, Delete, Get, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../config';
import { APP_CONFIG } from '../config.token';
import { requireAuth } from './auth.controller';
import { setSessionCookie } from './cookies';
import { type AuthedRequest, Public, Roles } from './guards';
import { InvitationsService } from './invitations.service';
import {
  parseBody,
  passwordSchema,
  platoUsernameSchema,
  tokenSchema,
  usernameSchema,
} from './schemas';

/** Le propriétaire n'invite que des créateurs de groupe ; les admins sont invités par eux (PR 7). */
const createSchema = z.object({
  role: z.literal(Role.GROUP_SUPER_ADMIN).default(Role.GROUP_SUPER_ADMIN),
});
const acceptSchema = z.object({
  token: tokenSchema,
  username: usernameSchema,
  password: passwordSchema,
  platoUsername: platoUsernameSchema,
});
const idSchema = z.string().uuid();

@Controller('invitations')
export class InvitationsController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(InvitationsService) private readonly invitations: InvitationsService,
  ) {}

  @Roles(Role.PLATFORM_OWNER)
  @Post()
  create(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { role } = parseBody(createSchema, body ?? {});
    return this.invitations.create(requireAuth(req).user.id, role);
  }

  @Roles(Role.PLATFORM_OWNER)
  @Get()
  list(@Req() req: AuthedRequest) {
    return this.invitations.listPending(requireAuth(req).user.id);
  }

  @Roles(Role.PLATFORM_OWNER)
  @Delete(':id')
  async revoke(@Req() req: AuthedRequest, @Param('id') id: string) {
    await this.invitations.revoke(requireAuth(req).user.id, parseBody(idSchema, id));
  }

  /** Accepte une invitation : crée le compte et ouvre la session. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('accept')
  async accept(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { token, ...input } = parseBody(acceptSchema, body);
    const { user, session } = await this.invitations.accept(token, input);
    setSessionCookie(res, session.token, session.expiresAt, this.config);
    return { user, csrfToken: session.csrfToken };
  }
}
