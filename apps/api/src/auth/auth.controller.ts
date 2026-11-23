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
import { type AuthedRequest, MfaExempt, Public } from './guards';
import { MfaService } from './mfa.service';
import { ResetService } from './reset.service';
import { passwordSchema, parseBody, tokenSchema } from './schemas';
import { SessionService, type AuthContext } from './session.service';

const loginSchema = z.object({ username: z.string().max(64), password: z.string().max(128) });
const changePasswordSchema = z.object({
  currentPassword: z.string().max(128),
  newPassword: passwordSchema,
});
const codeSchema = z.object({ code: z.string().min(1).max(32) });
const loginMfaSchema = z.object({ challenge: tokenSchema, code: z.string().min(1).max(32) });
const disableMfaSchema = z.object({
  password: z.string().max(128),
  code: z.string().min(1).max(32),
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
    @Inject(MfaService) private readonly mfa: MfaService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { username, password } = parseBody(loginSchema, body);
    const result = await this.auth.login(username, password);
    // Double authentification active : aucun cookie, seulement un jeton d'étape à échanger avec le code.
    if (result.mfaRequired) return { mfaRequired: true as const, challenge: result.challenge };
    setSessionCookie(res, result.session.token, result.session.expiresAt, this.config);
    return { user: result.user, csrfToken: result.session.csrfToken };
  }

  /** Seconde étape de la connexion : le code de l'application (ou un code de secours). */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login/mfa')
  async loginMfa(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { challenge, code } = parseBody(loginMfaSchema, body);
    const { user, session } = await this.auth.loginWithCode(challenge, code);
    setSessionCookie(res, session.token, session.expiresAt, this.config);
    return { user, csrfToken: session.csrfToken, elevatedUntil: session.elevatedUntil };
  }

  @MfaExempt()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.sessions.destroy(requireAuth(req).sessionId);
    clearSessionCookie(res, this.config);
  }

  /** Qui suis-je ? L'interface l'appelle au chargement pour savoir si une session est ouverte. */
  @MfaExempt()
  @Get('me')
  me(@Req() req: AuthedRequest) {
    const { user, csrfToken, elevatedUntil } = requireAuth(req);
    return { user, csrfToken, elevatedUntil };
  }

  /** État de la double authentification du compte connecté. */
  @MfaExempt()
  @Get('mfa')
  async mfaStatus(@Req() req: AuthedRequest) {
    const { user, elevatedUntil } = requireAuth(req);
    return {
      enabled: user.mfaEnabled,
      required: user.role === 'PLATFORM_OWNER',
      elevatedUntil,
      recoveryCodesLeft: user.mfaEnabled ? await this.mfa.remainingRecoveryCodes(user.id) : 0,
    };
  }

  /** Étape 1 de l'activation : un secret neuf, à scanner (QR code) dans l'application d'authentification. */
  @MfaExempt()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('mfa/setup')
  setupMfa(@Req() req: AuthedRequest) {
    return this.mfa.beginSetup(requireAuth(req).user.id);
  }

  /** Étape 2 : le premier code prouve que l'application est bien configurée ; les codes de secours s'affichent. */
  @MfaExempt()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('mfa/enable')
  enableMfa(@Req() req: AuthedRequest, @Body() body: unknown) {
    const auth = requireAuth(req);
    return this.mfa.enable(auth.user.id, auth.sessionId, parseBody(codeSchema, body).code);
  }

  /** Ressaisie du code : autorise les actions sensibles pendant 10 minutes. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('mfa/elevate')
  async elevate(@Req() req: AuthedRequest, @Body() body: unknown) {
    const auth = requireAuth(req);
    const elevatedUntil = await this.mfa.elevate(
      auth.user.id,
      auth.sessionId,
      parseBody(codeSchema, body).code,
    );
    return { elevatedUntil };
  }

  /** Nouveaux codes de secours (les anciens cessent de marcher). */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('mfa/recovery-codes')
  recoveryCodes(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.mfa.regenerateRecoveryCodes(
      requireAuth(req).user.id,
      parseBody(codeSchema, body).code,
    );
  }

  /** Désactivation, refusée au propriétaire : mot de passe ET code. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Post('mfa/disable')
  async disableMfa(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { password, code } = parseBody(disableMfaSchema, body);
    await this.mfa.disable(requireAuth(req).user.id, password, code);
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
