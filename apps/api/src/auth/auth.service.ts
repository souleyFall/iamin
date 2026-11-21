import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { hashPassword, newToken, verifyPassword } from './crypto';
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

@Injectable()
export class AuthService {
  private readonly throttle = new LoginThrottle();
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  /**
   * Empreinte factice vérifiée quand le compte n'existe pas : la réponse prend le même temps
   * qu'avec un vrai compte, ce qui empêche de deviner quels identifiants existent.
   */
  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword(newToken());
    return this.dummyHash;
  }

  async login(
    rawUsername: string,
    password: string,
  ): Promise<{ user: AuthUser; session: CreatedSession }> {
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
    const session = await this.sessions.create(user.id);
    return { user: toAuthUser(user), session };
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
