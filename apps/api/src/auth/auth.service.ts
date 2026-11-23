import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { hashPassword, newToken, sha256, verifyPassword } from './crypto';
import { LoginThrottle } from './login-throttle';
import { MfaService } from './mfa.service';
import { ownerPasswordProblem } from './schemas';
import { SecurityService } from './security.service';
import {
  type AuthContext,
  type AuthUser,
  type CreatedSession,
  SessionService,
  toAuthUser,
} from './session.service';

/** Même message pour un compte inconnu et pour un mauvais mot de passe : pas d'énumération. */
const LOGIN_FAILED = 'Identifiant ou mot de passe incorrect';
const TOO_MANY = 'Trop de tentatives. Réessaie dans quelques minutes.';
const CHALLENGE_EXPIRED = 'Connexion expirée, recommence avec ton mot de passe';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGE_ATTEMPTS = 5;
/** Échecs tolérés pour un même compte depuis une même adresse, puis pour ce compte toutes adresses confondues. */
const MAX_FAILURES_PER_PAIR = 10;
const MAX_FAILURES_PER_ACCOUNT = 50;

/** D'où vient la requête : l'adresse sert à la limite seulement, l'appareil à la liste des sessions. */
export interface LoginContext {
  ip?: string;
  device?: string;
}

@Injectable()
export class AuthService {
  /**
   * Deux compteurs d'échecs (R25). Par compte ET adresse : un tiers qui s'acharne sur ton compte se
   * bloque lui-même, mais toi, depuis une autre adresse, tu te connectes. Par compte seul, avec un
   * seuil bien plus haut : une attaque répartie sur beaucoup d'adresses finit quand même par
   * s'arrêter.
   */
  private readonly pairThrottle = new LoginThrottle(MAX_FAILURES_PER_PAIR);
  private readonly accountThrottle = new LoginThrottle(MAX_FAILURES_PER_ACCOUNT);
  /** Changement de mot de passe : par compte connecté, sans lien avec la connexion. */
  private readonly changeThrottle = new LoginThrottle();
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(MfaService) private readonly mfa: MfaService,
    @Inject(SecurityService) private readonly security: SecurityService,
  ) {}

  /**
   * Empreinte factice vérifiée quand le compte n'existe pas : la réponse prend le même temps
   * qu'avec un vrai compte, ce qui empêche de deviner quels identifiants existent.
   */
  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword(newToken());
    return this.dummyHash;
  }

  private isLocked(username: string, ctx: LoginContext): boolean {
    return (
      this.pairThrottle.isLocked(`${username}|${ctx.ip ?? '?'}`) ||
      this.accountThrottle.isLocked(username)
    );
  }

  /**
   * Première étape : identifiant et mot de passe. Sans double authentification, la session s'ouvre.
   * Avec, aucune session n'existe encore : on remet un jeton d'étape (5 minutes, 5 essais) à
   * échanger contre une session avec le code (loginWithCode).
   */
  async login(
    rawUsername: string,
    password: string,
    ctx: LoginContext = {},
  ): Promise<
    | { mfaRequired: true; challenge: string }
    | { mfaRequired: false; user: AuthUser; session: CreatedSession }
  > {
    const username = rawUsername.trim().toLowerCase();
    const pairKey = `${username}|${ctx.ip ?? '?'}`;
    if (this.isLocked(username, ctx)) {
      // Le titulaire le voit dans son journal, sans que la réponse dise si le compte existe.
      const known = await this.prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });
      if (known) await this.security.recordOnce(known.id, 'ACCOUNT_LOCKED', ctx.device);
      throw new HttpException(TOO_MANY, HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.user.findUnique({ where: { username } });
    const valid = await verifyPassword(user?.passwordHash ?? (await this.getDummyHash()), password);
    if (!user || !valid) {
      this.pairThrottle.recordFailure(pairKey);
      this.accountThrottle.recordFailure(username);
      if (user) await this.security.recordOnce(user.id, 'LOGIN_FAILED', ctx.device);
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    // Seul le compteur de cette adresse repart de zéro : un succès n'efface pas les échecs des autres.
    this.pairThrottle.reset(pairKey);
    if (user.totpEnabledAt) {
      return { mfaRequired: true, challenge: await this.createChallenge(user.id) };
    }
    // Un propriétaire sans double authentification entre quand même : il est dirigé vers son activation
    // (MfaEnrollmentGuard bloque tout le reste), sinon il ne pourrait jamais l'activer.
    const session = await this.sessions.create(user.id, new Date(), {
      role: user.role,
      device: ctx.device,
    });
    await this.security.record(user.id, 'LOGIN_OK', ctx.device);
    return { mfaRequired: false, user: toAuthUser(user), session };
  }

  private async createChallenge(userId: string, now = new Date()): Promise<string> {
    const token = newToken();
    await this.prisma.mfaChallenge.create({
      data: {
        tokenHash: sha256(token),
        userId,
        expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
      },
    });
    return token;
  }

  /** Seconde étape : le code (application ou secours) donne la session, déjà « élevée » 10 minutes. */
  async loginWithCode(
    challengeToken: string,
    code: string,
    ctx: LoginContext = {},
    now = new Date(),
  ): Promise<{ user: AuthUser; session: CreatedSession }> {
    const challenge = await this.prisma.mfaChallenge.findUnique({
      where: { tokenHash: sha256(challengeToken) },
      include: { user: true },
    });
    if (!challenge || challenge.expiresAt.getTime() <= now.getTime()) {
      if (challenge) await this.prisma.mfaChallenge.deleteMany({ where: { id: challenge.id } });
      throw new UnauthorizedException(CHALLENGE_EXPIRED);
    }
    if (challenge.attempts >= MAX_CHALLENGE_ATTEMPTS) {
      await this.prisma.mfaChallenge.deleteMany({ where: { id: challenge.id } });
      throw new UnauthorizedException(CHALLENGE_EXPIRED);
    }
    // Le compteur monte avant la vérification : des essais simultanés ne dépassent pas la limite.
    await this.prisma.mfaChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    if (!(await this.mfa.verify(challenge.user, code, now, ctx.device))) {
      throw new UnauthorizedException('Code incorrect');
    }
    await this.prisma.mfaChallenge.deleteMany({ where: { id: challenge.id } });
    const session = await this.sessions.create(challenge.userId, now, {
      role: challenge.user.role,
      elevated: true,
      device: ctx.device,
    });
    await this.security.record(challenge.userId, 'LOGIN_OK', ctx.device);
    return { user: toAuthUser(challenge.user), session };
  }

  /**
   * Change le mot de passe de l'utilisateur connecté. Toutes ses autres sessions sont fermées :
   * si quelqu'un d'autre avait la session, il est déconnecté.
   */
  async changePassword(
    auth: AuthContext,
    currentPassword: string,
    newPassword: string,
    ctx: LoginContext = {},
  ): Promise<void> {
    const key = `change:${auth.user.id}`;
    if (this.changeThrottle.isLocked(key)) {
      throw new HttpException(TOO_MANY, HttpStatus.TOO_MANY_REQUESTS);
    }
    const user = await this.prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
      this.changeThrottle.recordFailure(key);
      throw new BadRequestException({
        message: 'Données invalides',
        errors: [{ field: 'currentPassword', message: 'Mot de passe actuel incorrect' }],
      });
    }
    // Le compte propriétaire est le plus exposé : mot de passe plus long, sans son identifiant.
    const weak =
      user.role === Role.PLATFORM_OWNER ? ownerPasswordProblem(user.username, newPassword) : null;
    if (weak) {
      throw new BadRequestException({
        message: 'Données invalides',
        errors: [{ field: 'newPassword', message: weak }],
      });
    }
    this.changeThrottle.reset(key);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() },
    });
    await this.sessions.destroyAllForUser(user.id, auth.sessionId);
    await this.security.record(user.id, 'PASSWORD_CHANGED', ctx.device);
  }
}
