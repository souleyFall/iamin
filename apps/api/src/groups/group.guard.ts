import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GroupRole, Role } from '@prisma/client';
import { z } from 'zod';
import type { AuthedRequest } from '../auth/guards';
import { PrismaService } from '../prisma.service';

export const GROUP_ACCESS = 'groupAccess';

export interface GroupAccessOptions {
  /** Rôles du groupe autorisés sur cette route. */
  roles: GroupRole[];
  /**
   * Le propriétaire de la plateforme passe-t-il sans être membre ? Oui pour l'assistance
   * (créer un groupe, réinviter un créateur) ; non pour les données du groupe (tournois…) :
   * l'appartenance est alors la seule porte d'entrée.
   */
  allowOwner?: boolean;
}

/** Contexte de groupe attaché à la requête par `GroupGuard`. */
export interface GroupContext {
  groupId: string;
  /** Rôle du compte dans le groupe, `null` s'il passe en tant que propriétaire de la plateforme. */
  role: GroupRole | null;
}

export interface GroupRequest extends AuthedRequest {
  group?: GroupContext;
}

/** Route liée à un groupe (`:groupId` dans le chemin) : précise qui y a accès. */
export const GroupAccess = (options: GroupAccessOptions): MethodDecorator & ClassDecorator =>
  SetMetadata(GROUP_ACCESS, options);

const groupIdSchema = z.string().uuid();
const NOT_FOUND = 'Groupe introuvable';

/**
 * Garde d'appartenance : seule porte d'entrée vers les données d'un groupe (risque R1).
 *
 * - Un compte qui n'est pas membre reçoit **404**, exactement comme pour un groupe qui
 *   n'existe pas : impossible de deviner quels groupes existent.
 * - Un membre dont le rôle ne suffit pas reçoit 403.
 * - Le groupe est lu dans le chemin de la requête, jamais dans le corps : un client ne peut pas
 *   viser un autre groupe que celui vérifié ici.
 *
 * À employer avec `@UseGuards(GroupGuard)` et `@GroupAccess(...)`. Une route sans
 * `@GroupAccess` n'est pas concernée.
 */
@Injectable()
export class GroupGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<GroupAccessOptions | undefined>(GROUP_ACCESS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!options) return true;

    const req = context.switchToHttp().getRequest<GroupRequest>();
    if (!req.auth) throw new UnauthorizedException('Connexion requise');

    const parsed = groupIdSchema.safeParse(req.params.groupId);
    if (!parsed.success) throw new NotFoundException(NOT_FOUND);
    const groupId = parsed.data;

    if (req.auth.user.role === Role.PLATFORM_OWNER && options.allowOwner) {
      const exists = await this.prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException(NOT_FOUND);
      req.group = { groupId, role: null };
      return true;
    }

    const membership = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: req.auth.user.id } },
      select: { role: true },
    });
    if (!membership) throw new NotFoundException(NOT_FOUND);
    if (!options.roles.includes(membership.role)) throw new ForbiddenException('Accès refusé');

    req.group = { groupId, role: membership.role };
    return true;
  }
}
