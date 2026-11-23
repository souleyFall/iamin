import { Controller, Get, Header, Inject, Param, Sse, type MessageEvent } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Observable } from 'rxjs';
import { z } from 'zod';
import { Public } from '../auth/guards';
import { parseBody } from '../auth/schemas';
import { LiveService } from './live.service';
import { MatchesService } from './matches.service';

const slugSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/**
 * Page publique d'un tournoi, sans compte : lecture seule, trouvée par le lien du tournoi.
 * Rien ici n'écrit, et rien ne montre un secret (jeton de joueur, inscriptions en attente,
 * détenteur de la main, versions des scores).
 */
@Controller('public/tournaments/:slug')
export class LiveController {
  constructor(
    @Inject(MatchesService) private readonly matches: MatchesService,
    @Inject(LiveService) private readonly live: LiveService,
  ) {}

  /** Tableau, calendrier, classement et liste des inscrits validés. */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @Get('view')
  view(@Param('slug') slug: string) {
    return this.matches.publicView(parseBody(slugSchema, slug));
  }

  /**
   * Flux d'événements (SSE) : un message `changed` avec la révision à chaque changement, puis le
   * client recharge `view`. Repli côté client : relire `view` toutes les 10 s.
   */
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Sse('live')
  async stream(@Param('slug') slug: string): Promise<Observable<MessageEvent>> {
    // On attend la vérification (lien connu, plafonds) AVANT d'ouvrir le flux : sinon les en-têtes
    // `200 text/event-stream` partent d'abord et l'erreur 404 ou 503 arrive trop tard, selon le
    // timing (course repérée en CI sur un lien inconnu).
    return this.live.stream(parseBody(slugSchema, slug));
  }
}
