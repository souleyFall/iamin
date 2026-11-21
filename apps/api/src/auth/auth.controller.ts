import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../config';
import { APP_CONFIG } from '../config.token';
import { AuthService } from './auth.service';
import { clearSessionCookie, setSessionCookie } from './cookies';
import { type AuthedRequest, Public } from './guards';
import { ResetService } from './reset.service';
import { passwordSchema, parseBody, tokenSchema } from './schemas';
import { SessionService, type AuthContext } from './session.service';

const loginSchema = z.object({ username: z.string().max(64), password: z.string().max(128) });
const changePasswordSchema = z.object({
  currentPassword: z.string().max(128),
  newPassword: passwordSchema,
});
const resetRequestSchema = z.object({ username: z.string().max(64) });
const resetSchema = z.object({ token: tokenSchema, newPassword: passwordSchema });

export function requireAuth(req: AuthedRequest): AuthContext {
  if (!req.auth) throw new UnauthorizedException('Connexion requise');
  return req.auth;
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ResetService) private readonly reset: ResetService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { username, password } = parseBody(loginSchema, body);
    const { user, session } = await this.auth.login(username, password);
    setSessionCookie(res, session.token, session.expiresAt, this.config);
    return { user, csrfToken: session.csrfToken };
  }

  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.sessions.destroy(requireAuth(req).sessionId);
    clearSessionCookie(res, this.config);
  }

  /** Qui suis-je ? L'interface l'appelle au chargement pour savoir si une session est ouverte. */
  @Get('me')
  me(@Req() req: AuthedRequest) {
    const { user, csrfToken } = requireAuth(req);
    return { user, csrfToken };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Post('change-password')
  async changePassword(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { currentPassword, newPassword } = parseBody(changePasswordSchema, body);
    await this.auth.changePassword(requireAuth(req), currentPassword, newPassword);
  }

  /** « J'ai oublié mon mot de passe » : même réponse que le compte existe ou non. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(202)
  @Post('reset-requests')
  async requestReset(@Body() body: unknown) {
    const { username } = parseBody(resetRequestSchema, body);
    await this.reset.request(username);
    return { status: 'received' };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(204)
  @Post('reset')
  async useResetToken(@Body() body: unknown) {
    const { token, newPassword } = parseBody(resetSchema, body);
    await this.reset.reset(token, newPassword);
  }
}
