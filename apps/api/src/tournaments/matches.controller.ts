import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { GroupRole } from '@prisma/client';
import { z } from 'zod';
import { requireAuth } from '../auth/auth.controller';
import { parseBody } from '../auth/schemas';
import { GroupAccess, GroupGuard, type GroupRequest } from '../groups/group.guard';
import { MatchesService } from './matches.service';

const idSchema = z.string().uuid();
const codeSchema = z.string().regex(/^R\d{1,3}M\d{1,3}$/, 'Code de match invalide');
const drawSchema = z.object({ legs: z.union([z.literal(1), z.literal(2)]).optional() });
const score = z.number().int().min(0).max(99);
// version (facultative) : celle du score affiché ; un écran périmé reçoit 409 au lieu d'écraser.
const version = z.number().int().min(0);
const resultSchema = z.union([
  z.object({ a: score, b: score, version: version.optional() }).strict(),
  z.object({ forfeit: z.enum(['a', 'b']), version: version.optional() }).strict(),
]);
const replaceSchema = z.object({ outId: idSchema, inId: idSchema });

const actorOf = (req: GroupRequest): string => requireAuth(req).user.id;

function groupIdOf(req: GroupRequest): string {
  if (!req.group) throw new Error('Contexte de groupe absent : @GroupAccess manquant');
  return req.group.groupId;
}

/** Même protection que `TournamentsController` : membre du groupe uniquement, propriétaire exclu. */
@UseGuards(GroupGuard)
@GroupAccess({ roles: [GroupRole.SUPER_ADMIN, GroupRole.ADMIN] })
@Controller('groups/:groupId/tournaments/:tournamentId')
export class MatchesController {
  constructor(@Inject(MatchesService) private readonly matches: MatchesService) {}

  /** Tirage au sort des joueurs présents (une seule fois). `legs` : 2 pour une ligue aller-retour. */
  @Post('draw')
  draw(@Req() req: GroupRequest, @Param('tournamentId') id: string, @Body() body: unknown) {
    const { legs } = parseBody(drawSchema, body ?? {});
    return this.matches.draw(groupIdOf(req), actorOf(req), parseBody(idSchema, id), legs);
  }

  /** Tableau ou calendrier, scores, classement. */
  @Get('draw')
  get(@Req() req: GroupRequest, @Param('tournamentId') id: string) {
    return this.matches.get(groupIdOf(req), parseBody(idSchema, id));
  }

  @Put('matches/:code/result')
  setResult(
    @Req() req: GroupRequest,
    @Param('tournamentId') id: string,
    @Param('code') code: string,
    @Body() body: unknown,
  ) {
    return this.matches.setResult(
      groupIdOf(req),
      actorOf(req),
      parseBody(idSchema, id),
      parseBody(codeSchema, code),
      parseBody(resultSchema, body),
    );
  }

  @Delete('matches/:code/result')
  deleteResult(
    @Req() req: GroupRequest,
    @Param('tournamentId') id: string,
    @Param('code') code: string,
  ) {
    return this.matches.deleteResult(
      groupIdOf(req),
      actorOf(req),
      parseBody(idSchema, id),
      parseBody(codeSchema, code),
    );
  }

  @HttpCode(200)
  @Post('replacements')
  replace(@Req() req: GroupRequest, @Param('tournamentId') id: string, @Body() body: unknown) {
    const { outId, inId } = parseBody(replaceSchema, body);
    return this.matches.replacePlayer(
      groupIdOf(req),
      actorOf(req),
      parseBody(idSchema, id),
      outId,
      inId,
    );
  }
}
