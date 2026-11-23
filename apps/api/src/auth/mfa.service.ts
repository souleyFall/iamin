import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Role, type User } from '@prisma/client';
import * as OTPAuth from 'otpauth';
import type { AppConfig } from '../config';
import { APP_CONFIG } from '../config.token';
import { PrismaService } from '../prisma.service';
import { decryptSecret, encryptSecret, sha256, verifyPassword } from './crypto';
import { LoginThrottle } from './login-throttle';
import { SessionService } from './session.service';

const ISSUER = 'i-am-in';
const PERIOD_S = 30;
/** Un code est accepté dans la tranche de 30 s en cours et celle d'avant ou d'après (horloges décalées). */
const WINDOW = 1;
export const RECOVERY_CODE_COUNT = 10;
/** Sans ambiguïté à la lecture : ni 0/o, ni 1/l/i. */
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export const MFA_REQUIRED_MESSAGE = 'Active la double authentification pour continuer';
const CODE_INVALID = 'Code incorrect';

/** Un code de secours se lit `xxxxx-xxxxx` ; la comparaison ignore casse, tiret et espaces. */
const normalizeRecovery = (code: string): string => code.toLowerCase().replace(/[^a-z0-9]/g, '');
const isTotpFormat = (code: string): boolean => /^\d{6}$/.test(code.replace(/\s/g, ''));

function newRecoveryCode(): string {
  const pick = () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)] ?? 'a';
  const chars = Array.from({ length: 10 }, pick).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

export interface MfaSetup {
  /** Secret en base32 : à saisir à la main si le QR code ne se scanne pas. */
  secret: string;
  /** URL `otpauth://` que l'application d'authentification lit dans le QR code. */
  otpauthUrl: string;
}

/**
 * Double authentification par TOTP (RFC 6238) : un code à 6 chiffres qui change toutes les 30 s.
 * Le secret est chiffré en base ; un code ne sert qu'une fois ; des codes de secours à usage unique
 * remplacent l'application perdue. Le propriétaire de la plateforme ne peut pas s'en passer.
 */
@Injectable()
export class MfaService {
  /** Limite les échecs de code par compte, en plus de la limite par adresse des routes. */
  private readonly throttle = new LoginThrottle(5);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  private totp(user: Pick<User, 'username'>, secret: OTPAuth.Secret): OTPAuth.TOTP {
    return new OTPAuth.TOTP({
      issuer: ISSUER,
      label: user.username,
      algorithm: 'SHA1', // seul algorithme lu partout (Microsoft Authenticator, Google, Aegis…)
      digits: 6,
      period: PERIOD_S,
      secret,
    });
  }

  /** Commence l'activation : crée un secret neuf (ou remplace celui d'une activation abandonnée). */
  async beginSetup(userId: string): Promise<MfaSetup> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabledAt)
      throw new ConflictException('La double authentification est déjà active');
    const secret = new OTPAuth.Secret({ size: 20 });
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecretEnc: encryptSecret(this.config.totpEncryptionKey, secret.base32) },
    });
    return { secret: secret.base32, otpauthUrl: this.totp(user, secret).toString() };
  }

  /**
   * Vérifie le premier code, active la double authentification et remet les codes de secours,
   * visibles cette seule fois. Les autres sessions du compte sont fermées : une session ouverte
   * avant l'activation (volée, par exemple) ne survit pas.
   */
  async enable(userId: string, sessionId: string, code: string, now = new Date()) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabledAt)
      throw new ConflictException('La double authentification est déjà active');
    if (!user.totpSecretEnc) throw new BadRequestException('Commence par générer un secret');
    this.assertNotLocked(userId);
    if (!(await this.checkTotp(user, code, now))) {
      this.throttle.recordFailure(`mfa:${userId}`);
      throw new BadRequestException(CODE_INVALID);
    }
    this.throttle.reset(`mfa:${userId}`);
    const recoveryCodes = await this.replaceRecoveryCodes(userId);
    await this.prisma.user.update({ where: { id: userId }, data: { totpEnabledAt: now } });
    await this.sessions.destroyAllForUser(userId, sessionId);
    await this.sessions.elevate(sessionId, now);
    return { recoveryCodes };
  }

  private assertNotLocked(userId: string): void {
    if (this.throttle.isLocked(`mfa:${userId}`)) {
      throw new HttpException(
        'Trop de codes incorrects. Réessaie dans quelques minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Un code est valable une seule fois : on refuse toute tranche de 30 s déjà acceptée, et la mise
   * à jour conditionnelle empêche deux requêtes simultanées de le consommer toutes les deux.
   */
  private async checkTotp(user: User, code: string, now: Date): Promise<boolean> {
    if (!user.totpSecretEnc) return false;
    const token = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(token)) return false;
    let secret: OTPAuth.Secret;
    try {
      secret = OTPAuth.Secret.fromBase32(
        decryptSecret(this.config.totpEncryptionKey, user.totpSecretEnc),
      );
    } catch {
      return false; // clé changée ou texte altéré : jamais une erreur détaillée
    }
    const delta = this.totp(user, secret).validate({
      token,
      timestamp: now.getTime(),
      window: WINDOW,
    });
    if (delta === null) return false;
    const step = Math.floor(now.getTime() / 1000 / PERIOD_S) + delta;
    const { count } = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
      },
      data: { totpLastStep: step },
    });
    return count === 1;
  }

  private async checkRecovery(userId: string, code: string, now: Date): Promise<boolean> {
    const normalized = normalizeRecovery(code);
    if (normalized.length !== 10) return false;
    const { count } = await this.prisma.recoveryCode.updateMany({
      where: { userId, codeHash: sha256(normalized), usedAt: null },
      data: { usedAt: now },
    });
    return count === 1;
  }

  /**
   * Vérifie un code d'une application (6 chiffres) ou un code de secours. Les échecs sont comptés
   * par compte : trop d'essais et le compte attend quelques minutes (R25, R28).
   */
  async verify(user: User, code: string, now = new Date()): Promise<boolean> {
    this.assertNotLocked(user.id);
    const ok = isTotpFormat(code)
      ? await this.checkTotp(user, code, now)
      : await this.checkRecovery(user.id, code, now);
    if (ok) this.throttle.reset(`mfa:${user.id}`);
    else this.throttle.recordFailure(`mfa:${user.id}`);
    return ok;
  }

  /** Ressaisie du code : autorise les actions sensibles pendant 10 minutes. */
  async elevate(userId: string, sessionId: string, code: string, now = new Date()): Promise<Date> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpEnabledAt) throw new ForbiddenException(MFA_REQUIRED_MESSAGE);
    if (!(await this.verify(user, code, now))) throw new UnauthorizedException(CODE_INVALID);
    return this.sessions.elevate(sessionId, now);
  }

  /** Remplace les codes de secours (les anciens cessent de marcher) ; exige un code valide. */
  async regenerateRecoveryCodes(userId: string, code: string, now = new Date()) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpEnabledAt) throw new ForbiddenException(MFA_REQUIRED_MESSAGE);
    if (!(await this.verify(user, code, now))) throw new UnauthorizedException(CODE_INVALID);
    return { recoveryCodes: await this.replaceRecoveryCodes(userId) };
  }

  private async replaceRecoveryCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
    await this.prisma.$transaction([
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      this.prisma.recoveryCode.createMany({
        data: codes.map((c) => ({ userId, codeHash: sha256(normalizeRecovery(c)) })),
      }),
    ]);
    return codes;
  }

  async remainingRecoveryCodes(userId: string): Promise<number> {
    return this.prisma.recoveryCode.count({ where: { userId, usedAt: null } });
  }

  /**
   * Désactive la double authentification d'un compte ordinaire (mot de passe ET code). Le
   * propriétaire de la plateforme ne peut pas : la seule voie est la ligne de commande du serveur.
   */
  async disable(userId: string, password: string, code: string, now = new Date()): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.role === Role.PLATFORM_OWNER) {
      throw new ForbiddenException(
        'Le propriétaire ne peut pas désactiver la double authentification',
      );
    }
    if (!user.totpEnabledAt)
      throw new ConflictException('La double authentification n’est pas active');
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new UnauthorizedException('Mot de passe incorrect');
    }
    if (!(await this.verify(user, code, now))) throw new UnauthorizedException(CODE_INVALID);
    await this.prisma.$transaction([
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null },
      }),
    ]);
  }
}
