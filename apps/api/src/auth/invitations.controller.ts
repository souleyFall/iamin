import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../config';
import { APP_CONFIG } from '../config.token';
import { requireAuth } from './auth.controller';
import { setSessionCookie } from './cookies';
import { type AuthedRequest, Public } from './guards';
import { InvitationsService } from './invitations.service';
import {
  parseBody,
  passwordSchema,
  platoUsernameSchema,
  tokenSchema,
  usernameSchema,
} from './schemas';

const acceptSchema = z.object({
  token: tokenSchema,
  username: usernameSchema,
  password: passwordSchema,
  platoUsername: platoUsernameSchema,
});
const joinSchema = z.object({ token: tokenSchema });

/**
 * Utilisation d'une invitation. La création, la liste et l'annulation des invitations se font
 * dans le groupe concerné (`/groups/:groupId/invitations`).
 */
@Controller('invitations')
export class InvitationsController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(InvitationsService) private readonly invitations: InvitationsService,
  ) {}

  /** Accepte une invitation avec un nouveau compte : crée le compte et ouvre la session. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('accept')
  async accept(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { token, ...input } = parseBody(acceptSchema, body);
    const { user, session } = await this.invitations.accept(token, input);
    setSessionCookie(res, session.token, session.expiresAt, this.config);
    return { user, csrfToken: session.csrfToken };
  }

  /**
   * La page du lien demande si l'invitation impose un pseudo Plato. En POST pour que le jeton ne
   * passe jamais dans une adresse. Refus identique pour un jeton inconnu, expiré ou déjà utilisé.
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('preview')
  preview(@Body() body: unknown) {
    return this.invitations.preview(parseBody(joinSchema, body).token);
  }

  /** Un compte déjà connecté rejoint un autre groupe avec une invitation. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('join')
  join(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { token } = parseBody(joinSchema, body);
    return this.invitations.join(requireAuth(req).user.id, token);
  }
}
