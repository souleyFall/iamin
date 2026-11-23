import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { hashPassword, newToken, sha256, verifyPassword } from './crypto';
import { MfaService } from './mfa.service';
import { LoginThrottle } from './login-throttle';
import {
  type AuthContext,
  type AuthUser,
  type CreatedSession,
  SessionService,
  toAuthUser,
} from './session.service';

/** Même message pour un compte inconnu et pour un mauvais mot de passe : pas d'énumération. */
const LOGIN_FAILED = 'Identifiant ou mot de passe incorrect';
const CHALLENGE_EXPIRED = 'Connexion expirée, recommence avec ton mot de passe';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGE_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly throttle = new LoginThrottle();
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(MfaService) private readonly mfa: MfaService,
  ) {}

  /**
   * Empreinte factice vérifiée quand le compte n'existe pas : la réponse prend le même temps
   * qu'avec un vrai compte, ce qui empêche de deviner quels identifiants existent.
   */
  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword(newToken());
    return this.dummyHash;
  }

  /**
   * Première étape : identifiant et mot de passe. Sans double authentification, la session s'ouvre.
   * Avec, aucune session n'existe encore : on remet un jeton d'étape (5 minutes, 5 essais) à
   * échanger contre une session avec le code (loginWithCode).
   */
  async login(
    rawUsername: string,
    password: string,
  ): Promise<
    | { mfaRequired: true; challenge: string }
    | { mfaRequired: false; user: AuthUser; session: CreatedSession }
  > {
    const username = rawUsername.trim().toLowerCase();
    if (this.throttle.isLocked(username)) {
      throw new HttpException(
        'Trop de tentatives. Réessaie dans quelques minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.prisma.user.findUnique({ where: { username } });
    const valid = await verifyPassword(user?.passwordHash ?? (await this.getDummyHash()), password);
    if (!user || !valid) {
      this.throttle.recordFailure(username);
      throw new UnauthorizedException(LOGIN_FAILED);
    }

    this.throttle.reset(username);
    if (user.totpEnabledAt) {
      return { mfaRequired: true, challenge: await this.createChallenge(user.id) };
    }
    // Un propriétaire sans double authentification entre quand même : il est dirigé vers son activation
    // (MfaEnrollmentGuard bloque tout le reste), sinon il ne pourrait jamais l'activer.
    const session = await this.sessions.create(user.id, new Date(), { role: user.role });
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
    if (!(await this.mfa.verify(challenge.user, code, now))) {
      throw new UnauthorizedException('Code incorrect');
    }
    await this.prisma.mfaChallenge.deleteMany({ where: { id: challenge.id } });
    const session = await this.sessions.create(challenge.userId, now, {
      role: challenge.user.role,
      elevated: true,
    });
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
  ): Promise<void> {
    const key = `change:${auth.user.id}`;
    if (this.throttle.isLocked(key)) {
      throw new HttpException(
        'Trop de tentatives. Réessaie dans quelques minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const user = await this.prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
      this.throttle.recordFailure(key);
      throw new BadRequestException({
        message: 'Données invalides',
        errors: [{ field: 'currentPassword', message: 'Mot de passe actuel incorrect' }],
      });
    }
    this.throttle.reset(key);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() },
    });
    await this.sessions.destroyAllForUser(user.id, auth.sessionId);
  }
}
