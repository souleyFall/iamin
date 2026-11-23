import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import {
  AuthGuard,
  ElevationGuard,
  MfaEnrollmentGuard,
  OriginGuard,
  RolesGuard,
} from './auth/guards';
import { MfaService } from './auth/mfa.service';
import { SecurityService } from './auth/security.service';
import { CreatorInvitationsController } from './auth/creator-invitations.controller';
import { InvitationsController } from './auth/invitations.controller';
import { InvitationsService } from './auth/invitations.service';
import { ResetService } from './auth/reset.service';
import { SessionService } from './auth/session.service';
import { TicketsController } from './auth/tickets.controller';
import type { AppConfig } from './config';
import { APP_CONFIG } from './config.token';
import { FeedbackController, PublicFeedbackController } from './feedback/feedback.controller';
import { FeedbackService } from './feedback/feedback.service';
import { HealthController } from './health.controller';
import { LocalizedExceptionFilter } from './i18n/localized-exception.filter';
import { GroupGuard } from './groups/group.guard';
import { GroupsController } from './groups/groups.controller';
import { GroupsService } from './groups/groups.service';
import { ClientErrorsController } from './logging/client-errors.controller';
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
        FeedbackController,
        PublicFeedbackController,
        ClientErrorsController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        PrismaService,
        SessionService,
        AuthService,
        MfaService,
        SecurityService,
        InvitationsService,
        ResetService,
        GroupsService,
        TournamentsService,
        MatchesService,
        EventsService,
        RelayService,
        LiveService,
        FeedbackService,
        // Messages d'erreur dans la langue de la personne (Accept-Language), catalogue de D27.
        { provide: APP_FILTER, useClass: LocalizedExceptionFilter },
        // Garde de route (@UseGuards) : exécutée après les gardes globales ci-dessous.
        GroupGuard,
        // Ordre d'exécution : limite de débit, origine, session et CSRF, rôle, double authentification obligatoire du propriétaire, puis ressaisie du code.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: OriginGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: MfaEnrollmentGuard },
        { provide: APP_GUARD, useClass: ElevationGuard },
      ],
    };
  }
}
