import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import type { AppConfig } from '../config';
import { APP_CONFIG } from '../config.token';
import { readSessionToken } from './cookies';
import { setRequestUser } from '../logging/context';
import { safeEqual } from './crypto';
import { type AuthContext, SessionService } from './session.service';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';
export const MFA_EXEMPT = 'mfaExempt';
export const REQUIRE_ELEVATION = 'requireElevation';

/** Route accessible sans être connecté (connexion, invitation, demande de réinitialisation…). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);
/** Route réservée à certains rôles. */
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES, roles);

/**
 * Route accessible à un propriétaire qui n'a pas encore activé la double authentification : celles qui
 * servent à l'activer, à se déconnecter et à savoir qui on est. Toutes les autres lui sont fermées.
 */
export const MfaExempt = (): MethodDecorator & ClassDecorator => SetMetadata(MFA_EXEMPT, true);
/**
 * Action sensible : exige une connexion ou une ressaisie du code datant de moins de 10 minutes.
 * Une session volée ne suffit plus pour inviter un super admin, émettre un lien de réinitialisation…
 */
export const RequireElevation = (): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_ELEVATION, true);

export interface AuthedRequest extends Request {
  auth?: AuthContext;
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protection CSRF, première couche : si le navigateur envoie un en-tête `Origin` (il le fait
 * pour toute requête qui modifie des données), il doit être celui de l'interface.
 * Les clients sans navigateur (tests, curl) n'envoient pas d'`Origin` et ne sont pas concernés :
 * ils n'ont pas de cookie de session ambiant à détourner.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== this.config.webOrigin) {
      throw new ForbiddenException('Origine non autorisée');
    }
    return true;
  }
}

/**
 * Garde globale : toute route exige une session valide, sauf celles marquées `@Public()`.
 * Seconde couche anti-CSRF : une requête authentifiée qui modifie des données doit renvoyer
 * le jeton propre à la session dans l'en-tête `x-csrf-token`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const token = readSessionToken(req.headers.cookie, this.config);
    const auth = token ? await this.sessions.resolve(token) : null;
    if (auth) {
      req.auth = auth;
      // Les lignes de journal de cette requête portent le compte (identifiant, jamais son nom).
      setRequestUser(auth.user.id, auth.user.role);
    }

    if (isPublic) return true;
    if (!auth) throw new UnauthorizedException('Connexion requise');

    if (!SAFE_METHODS.has(req.method)) {
      const sent = req.headers['x-csrf-token'];
      if (typeof sent !== 'string' || !safeEqual(sent, auth.csrfToken)) {
        throw new ForbiddenException('Jeton CSRF manquant ou invalide');
      }
    }
    return true;
  }
}

/** Garde de rôle, appliquée après `AuthGuard`. Sans `@Roles()`, tout utilisateur connecté passe. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    if (!req.auth || !roles.includes(req.auth.user.role)) {
      throw new ForbiddenException('Accès refusé');
    }
    return true;
  }
}

/**
 * Le propriétaire de la plateforme ne peut rien faire tant que la double authentification n'est pas
 * active sur son compte. Les autres comptes ne sont pas concernés (activation facultative).
 */
@Injectable()
export class MfaEnrollmentGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets)) return true;
    if (this.reflector.getAllAndOverride<boolean | undefined>(MFA_EXEMPT, targets)) return true;
    const auth = context.switchToHttp().getRequest<AuthedRequest>().auth;
    if (auth?.user.role === Role.PLATFORM_OWNER && !auth.user.mfaEnabled) {
      throw new ForbiddenException({
        message: 'Active la double authentification pour continuer',
        code: 'MFA_ENROLLMENT_REQUIRED',
      });
    }
    return true;
  }
}

/** Refuse une action sensible si le code n'a pas été donné dans les 10 dernières minutes. */
@Injectable()
export class ElevationGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(REQUIRE_ELEVATION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const auth = context.switchToHttp().getRequest<AuthedRequest>().auth;
    if (!auth?.elevatedUntil || auth.elevatedUntil.getTime() <= Date.now()) {
      throw new ForbiddenException({
        message: 'Confirme avec ton code à 6 chiffres pour continuer',
        code: 'ELEVATION_REQUIRED',
      });
    }
    return true;
  }
}
