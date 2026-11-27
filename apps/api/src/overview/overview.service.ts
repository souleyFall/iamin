import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  GroupRole,
  type Prisma,
  RegistrationStatus,
  Role,
  SecurityEventType,
  type TournamentFormat,
  TournamentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';

/** « En ligne » : une session vue il y a moins de 15 minutes. */
export const ONLINE_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_PAGE = 50;

/** Les inscriptions qui comptent : un joueur remplacé n'occupe plus de place. */
const COUNTED = [
  RegistrationStatus.ACCEPTED,
  RegistrationStatus.WAITLIST,
  RegistrationStatus.PENDING,
];

export interface TournamentFilter {
  status?: TournamentStatus;
  format?: TournamentFormat;
  groupId?: string;
  q?: string;
  before?: string;
}

interface Counts {
  accepted: number;
  waitlist: number;
  pending: number;
}

const emptyCounts = (): Counts => ({ accepted: 0, waitlist: 0, pending: 0 });

function addCount(counts: Counts, status: RegistrationStatus, n: number): void {
  if (status === RegistrationStatus.ACCEPTED) counts.accepted += n;
  else if (status === RegistrationStatus.WAITLIST) counts.waitlist += n;
  else if (status === RegistrationStatus.PENDING) counts.pending += n;
}

/**
 * Vue d'ensemble de la plateforme pour son propriétaire (D30) : des totaux, les groupes, leurs super
 * admins et admins, les tournois et leur état. **Lecture seule** : aucune méthode d'écriture ici. Elle
 * ne montre ni les pseudos des joueurs, ni le journal d'un tournoi, ni les liens publics : seulement
 * des nombres pour les joueurs. Les routes des tournois eux-mêmes restent fermées au propriétaire
 * (D14).
 */
@Injectable()
export class OverviewService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(now = new Date()) {
    const [users, groups, tournaments, registrations, players, lastActive, online] =
      await Promise.all([
        this.prisma.user.findMany({
          where: { role: { not: Role.PLATFORM_OWNER } },
          select: {
            id: true,
            username: true,
            platoUsername: true,
            role: true,
            createdAt: true,
            memberships: {
              select: { role: true, group: { select: { id: true, name: true } } },
              orderBy: { group: { name: 'asc' } },
            },
          },
          orderBy: { username: 'asc' },
        }),
        this.prisma.group.findMany({
          select: { id: true, name: true, createdAt: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.tournament.findMany({
          select: {
            groupId: true,
            status: true,
            createdAt: true,
            _count: { select: { registrations: { where: { status: { in: COUNTED } } } } },
          },
        }),
        this.prisma.registration.groupBy({
          by: ['status'],
          where: { status: { in: COUNTED } },
          _count: { _all: true },
        }),
        // Joueurs différents : un même pseudo dans plusieurs tournois ne compte qu'une fois.
        this.prisma.registration.findMany({
          where: { status: { in: COUNTED } },
          distinct: ['platoKey'],
          select: { platoKey: true },
        }),
        this.lastActivity(now),
        this.prisma.session.findMany({
          where: {
            lastSeenAt: { gte: new Date(now.getTime() - ONLINE_MS) },
            expiresAt: { gt: now },
            user: { role: { not: Role.PLATFORM_OWNER } },
          },
          distinct: ['userId'],
          select: { userId: true },
        }),
      ]);

    const activeSince = (days: number) =>
      users.filter((u) => {
        const at = lastActive.get(u.id);
        return at !== undefined && at.getTime() >= now.getTime() - days * DAY_MS;
      }).length;

    const people = users.map((u) => {
      const isSuperAdmin =
        u.role === Role.GROUP_CREATOR ||
        u.memberships.some((m) => m.role === GroupRole.SUPER_ADMIN);
      return {
        id: u.id,
        username: u.username,
        platoUsername: u.platoUsername,
        kind: isSuperAdmin
          ? ('SUPER_ADMIN' as const)
          : u.memberships.length > 0
            ? ('ADMIN' as const)
            : ('NONE' as const),
        createdAt: u.createdAt,
        lastActiveAt: lastActive.get(u.id) ?? null,
        groups: u.memberships.map((m) => ({ id: m.group.id, name: m.group.name, role: m.role })),
      };
    });

    const byStatus = (status: TournamentStatus) =>
      tournaments.filter((t) => t.status === status).length;
    const total = (status: RegistrationStatus) =>
      registrations.find((r) => r.status === status)?._count._all ?? 0;

    return {
      generatedAt: now,
      accounts: {
        total: users.length,
        superAdmins: people.filter((p) => p.kind === 'SUPER_ADMIN').length,
        admins: people.filter((p) => p.kind === 'ADMIN').length,
      },
      // Des comptes seulement : les joueurs n'ont pas de compte, on ne les suit pas.
      active: { online: online.length, week: activeSince(7), month: activeSince(30) },
      tournaments: {
        total: tournaments.length,
        REGISTRATION: byStatus(TournamentStatus.REGISTRATION),
        CHECK_IN: byStatus(TournamentStatus.CHECK_IN),
        STARTED: byStatus(TournamentStatus.STARTED),
        FINISHED: byStatus(TournamentStatus.FINISHED),
      },
      registrations: {
        total: registrations.reduce((n, r) => n + r._count._all, 0),
        accepted: total(RegistrationStatus.ACCEPTED),
        waitlist: total(RegistrationStatus.WAITLIST),
        pending: total(RegistrationStatus.PENDING),
        players: players.length,
      },
      groups: groups.map((g) => {
        const own = tournaments.filter((t) => t.groupId === g.id);
        const members = people.filter((p) => p.groups.some((m) => m.id === g.id));
        const named = (role: GroupRole) =>
          members
            .filter((p) => p.groups.some((m) => m.id === g.id && m.role === role))
            .map((p) => ({ id: p.id, username: p.username }));
        return {
          id: g.id,
          name: g.name,
          createdAt: g.createdAt,
          superAdmins: named(GroupRole.SUPER_ADMIN),
          admins: named(GroupRole.ADMIN),
          tournaments: {
            total: own.length,
            running: own.filter((t) => t.status === TournamentStatus.STARTED).length,
            finished: own.filter((t) => t.status === TournamentStatus.FINISHED).length,
          },
          registrations: own.reduce((n, t) => n + t._count.registrations, 0),
          lastTournamentAt: own.reduce<Date | null>(
            (latest, t) => (latest === null || t.createdAt > latest ? t.createdAt : latest),
            null,
          ),
        };
      }),
      people,
    };
  }

  /** Les tournois de toute la plateforme, filtrés et paginés, du plus récent au plus ancien. */
  async tournaments(filter: TournamentFilter) {
    const where: Prisma.TournamentWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.format ? { format: filter.format } : {}),
      ...(filter.groupId ? { groupId: filter.groupId } : {}),
      ...(filter.q ? { name: { contains: filter.q, mode: 'insensitive' } } : {}),
    };
    if (filter.before !== undefined) {
      const known = await this.prisma.tournament.findFirst({
        where: { AND: [where, { id: filter.before }] },
        select: { id: true },
      });
      if (!known) throw new BadRequestException('Curseur inconnu');
    }
    const [total, rows] = await Promise.all([
      this.prisma.tournament.count({ where }),
      this.prisma.tournament.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: MAX_PAGE + 1,
        ...(filter.before === undefined ? {} : { cursor: { id: filter.before }, skip: 1 }),
        select: {
          id: true,
          name: true,
          format: true,
          status: true,
          capacity: true,
          createdAt: true,
          drawnAt: true,
          group: { select: { id: true, name: true } },
          holder: { select: { username: true } },
        },
      }),
    ]);
    const page = rows.slice(0, MAX_PAGE);
    const grouped =
      page.length === 0
        ? []
        : await this.prisma.registration.groupBy({
            by: ['tournamentId', 'status'],
            where: { tournamentId: { in: page.map((t) => t.id) }, status: { in: COUNTED } },
            _count: { _all: true },
          });
    return {
      total,
      tournaments: page.map(({ holder, ...t }) => {
        const counts = emptyCounts();
        for (const row of grouped) {
          if (row.tournamentId === t.id) addCount(counts, row.status, row._count._all);
        }
        return { ...t, holder: holder?.username ?? null, counts };
      }),
      nextBefore: rows.length > page.length ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  /**
   * Dernière activité connue de chaque compte : dernière requête d'une session encore ouverte, ou
   * dernière connexion réussie (journal de sécurité, gardé 30 jours, D25). Au-delà de 30 jours, un
   * compte n'a plus de date : il est simplement inactif.
   */
  private async lastActivity(now: Date): Promise<Map<string, Date>> {
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const [sessions, logins] = await Promise.all([
      this.prisma.session.groupBy({
        by: ['userId'],
        where: { lastSeenAt: { gte: since } },
        _max: { lastSeenAt: true },
      }),
      this.prisma.securityEvent.groupBy({
        by: ['userId'],
        where: { type: SecurityEventType.LOGIN_OK, createdAt: { gte: since } },
        _max: { createdAt: true },
      }),
    ]);
    const last = new Map<string, Date>();
    const keep = (id: string, at: Date | null) => {
      const known = last.get(id);
      if (at && (!known || at > known)) last.set(id, at);
    };
    for (const s of sessions) keep(s.userId, s._max.lastSeenAt);
    for (const l of logins) keep(l.userId, l._max.createdAt);
    return last;
  }
}
