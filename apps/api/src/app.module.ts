import { Module, type DynamicModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { AuthGuard, OriginGuard, RolesGuard } from './auth/guards';
import { CreatorInvitationsController } from './auth/creator-invitations.controller';
import { InvitationsController } from './auth/invitations.controller';
import { InvitationsService } from './auth/invitations.service';
import { ResetService } from './auth/reset.service';
import { SessionService } from './auth/session.service';
import { TicketsController } from './auth/tickets.controller';
import type { AppConfig } from './config';
import { APP_CONFIG } from './config.token';
import { HealthController } from './health.controller';
import { GroupGuard } from './groups/group.guard';
import { GroupsController } from './groups/groups.controller';
import { GroupsService } from './groups/groups.service';
import { PrismaService } from './prisma.service';
import { EventsService } from './tournaments/events.service';
import { LiveController } from './tournaments/live.controller';
import { LiveService } from './tournaments/live.service';
import { MatchesController } from './tournaments/matches.controller';
import { MatchesService } from './tournaments/matches.service';
import {
  PublicTournamentsController,
  TournamentsController,
} from './tournaments/tournaments.controller';
import { RelayController } from './tournaments/relay.controller';
import { RelayService } from './tournaments/relay.service';
import { TournamentsService } from './tournaments/tournaments.service';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ThrottlerModule.forRoot({
          // Limite générale par adresse IP ; les routes sensibles ont des limites plus basses.
          throttlers: [{ ttl: 60_000, limit: 120 }],
          // Les tests enchaînent des dizaines de connexions : seul NODE_ENV=test les exempte,
          // et la configuration refuse déjà un cookie non Secure en production.
          skipIf: () => config.nodeEnv === 'test',
        }),
      ],
      controllers: [
        HealthController,
        AuthController,
        InvitationsController,
        CreatorInvitationsController,
        TicketsController,
        GroupsController,
        TournamentsController,
        MatchesController,
        RelayController,
        PublicTournamentsController,
        LiveController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        PrismaService,
        SessionService,
        AuthService,
        InvitationsService,
        ResetService,
        GroupsService,
        TournamentsService,
        MatchesService,
        EventsService,
        RelayService,
        LiveService,
        // Garde de route (@UseGuards) : exécutée après les gardes globales ci-dessous.
        GroupGuard,
        // Ordre d'exécution : limite de débit, origine, session et CSRF, puis rôle.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: OriginGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    };
  }
}
