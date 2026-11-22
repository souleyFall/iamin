import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GroupRole, Presence, TournamentFormat, TournamentStatus } from '@prisma/client';
import { z } from 'zod';
import { Public } from '../auth/guards';
import { parseBody, platoUsernameSchema, tokenSchema } from '../auth/schemas';
import { GroupAccess, GroupGuard, type GroupRequest } from '../groups/group.guard';
import { TournamentsService } from './tournaments.service';

const MAX_CAPACITY = 256;

const nameSchema = z
  .string()
  .trim()
  .min(2, '2 caractères au minimum')
  .max(80, '80 caractères au maximum')
  // Le nom est recopié dans des messages de chat : pas de caractère de contrôle.
  .refine((v) => !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(v), 'Caractères non autorisés');
const capacitySchema = z.number().int().min(2).max(MAX_CAPACITY);

const createSchema = z.object({
  name: nameSchema,
  format: z.nativeEnum(TournamentFormat),
  capacity: capacitySchema,
  forfeitScore: z.number().int().min(1).max(99).optional(),
});
const updateSchema = z
  .object({
    name: nameSchema.optional(),
    capacity: capacitySchema.optional(),
    forfeitScore: z.number().int().min(1).max(99).optional(),
    // Le tirage (PR 9) fait passer en STARTED puis FINISHED : on ne les fixe pas à la main.
    status: z.enum([TournamentStatus.REGISTRATION, TournamentStatus.CHECK_IN]).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Aucune modification');
const playerSchema = z.object({ name: platoUsernameSchema });
const presenceSchema = z.object({ presence: z.nativeEnum(Presence) });
const idSchema = z.string().uuid();
const slugSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/** Toute route ici passe par GroupGuard : seule l'appartenance au groupe donne accès (R1). */
function groupIdOf(req: GroupRequest): string {
  if (!req.group) throw new Error('Contexte de groupe absent : @GroupAccess manquant');
  return req.group.groupId;
}

/**
 * Tournois d'un groupe. `@GroupAccess` est posé sur la classe : une route ajoutée plus tard est
 * protégée par défaut. `allowOwner` reste faux : le propriétaire de la plateforme ne lit pas les
 * données internes des groupes (D14).
 */
@UseGuards(GroupGuard)
@GroupAccess({ roles: [GroupRole.SUPER_ADMIN, GroupRole.ADMIN] })
@Controller('groups/:groupId/tournaments')
export class TournamentsController {
  constructor(@Inject(TournamentsService) private readonly tournaments: TournamentsService) {}

  @Post()
  create(@Req() req: GroupRequest, @Body() body: unknown) {
    return this.tournaments.create(groupIdOf(req), parseBody(createSchema, body));
  }

  @Get()
  list(@Req() req: GroupRequest) {
    return this.tournaments.list(groupIdOf(req));
  }

  @Get(':tournamentId')
  get(@Req() req: GroupRequest, @Param('tournamentId') id: string) {
    return this.tournaments.get(groupIdOf(req), parseBody(idSchema, id));
  }

  @Patch(':tournamentId')
  update(@Req() req: GroupRequest, @Param('tournamentId') id: string, @Body() body: unknown) {
    return this.tournaments.update(
      groupIdOf(req),
      parseBody(idSchema, id),
      parseBody(updateSchema, body),
    );
  }

  @Post(':tournamentId/registrations')
  addPlayer(@Req() req: GroupRequest, @Param('tournamentId') id: string, @Body() body: unknown) {
    const { name } = parseBody(playerSchema, body);
    return this.tournaments.addPlayer(groupIdOf(req), parseBody(idSchema, id), name);
  }

  @HttpCode(200)
  @Post(':tournamentId/registrations/:registrationId/accept')
  accept(
    @Req() req: GroupRequest,
    @Param('tournamentId') id: string,
    @Param('registrationId') registrationId: string,
  ) {
    return this.tournaments.accept(
      groupIdOf(req),
      parseBody(idSchema, id),
      parseBody(idSchema, registrationId),
    );
  }

  @Patch(':tournamentId/registrations/:registrationId')
  setPresence(
    @Req() req: GroupRequest,
    @Param('tournamentId') id: string,
    @Param('registrationId') registrationId: string,
    @Body() body: unknown,
  ) {
    return this.tournaments.setPresence(
      groupIdOf(req),
      parseBody(idSchema, id),
      parseBody(idSchema, registrationId),
      parseBody(presenceSchema, body).presence,
    );
  }

  @HttpCode(204)
  @Delete(':tournamentId/registrations/:registrationId')
  async removePlayer(
    @Req() req: GroupRequest,
    @Param('tournamentId') id: string,
    @Param('registrationId') registrationId: string,
  ) {
    await this.tournaments.removePlayer(
      groupIdOf(req),
      parseBody(idSchema, id),
      parseBody(idSchema, registrationId),
    );
  }
}

/**
 * Routes des joueurs, sans compte. Deux secrets distincts :
 * - le lien du tournoi (`slug`) : donne seulement le droit de s'inscrire ;
 * - le lien personnel du joueur, envoyé dans l'en-tête `x-player-token` (jamais dans l'URL, donc
 *   absent des journaux d'accès) : donne le droit de voir et d'annuler SON inscription.
 */
@Controller('public')
export class PublicTournamentsController {
  constructor(@Inject(TournamentsService) private readonly tournaments: TournamentsService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('tournaments/:slug')
  info(@Param('slug') slug: string) {
    return this.tournaments.publicInfo(parseBody(slugSchema, slug));
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('tournaments/:slug/registrations')
  async register(@Param('slug') slug: string, @Body() body: unknown) {
    const { name } = parseBody(playerSchema, body);
    return this.tournaments.register(parseBody(slugSchema, slug), name);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('registration')
  mine(@Headers('x-player-token') token: string | undefined) {
    return this.tournaments.myRegistration(parseBody(tokenSchema, token));
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(204)
  @Delete('registration')
  async withdraw(@Headers('x-player-token') token: string | undefined) {
    await this.tournaments.withdraw(parseBody(tokenSchema, token));
  }
}
