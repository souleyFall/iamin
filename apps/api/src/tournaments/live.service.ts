import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma.service';

/** Intervalle de vérification du journal, par tournoi regardé (pas par spectateur). */
export const POLL_MS = 1_000;
/** Message de maintien : sans lui, un proxy coupe une connexion silencieuse. */
const PING_MS = 25_000;
/** Une connexion se ferme d'elle-même après ce délai : le navigateur se reconnecte seul. */
const MAX_STREAM_MS = 30 * 60_000;
export const MAX_STREAMS = 500;
export const MAX_STREAMS_PER_TOURNAMENT = 200;

type Listener = (revision: number) => void;

interface Watch {
  revision: number;
  listeners: Set<Listener>;
  timer: NodeJS.Timeout;
}

export interface LiveMessage {
  type: 'changed' | 'ping';
  data: { revision?: number };
}

/**
 * Le temps réel de la page publique (D7). Le serveur surveille le JOURNAL du tournoi : chaque
 * changement y inscrit un événement dans sa transaction (R14), donc compter les événements
 * validés suffit à savoir que quelque chose a changé. Deux conséquences voulues :
 * - jamais d'annonce avant la validation : un spectateur qui recharge voit déjà le changement ;
 * - aucun appel à ajouter dans les services d'écriture, ni état partagé entre instances d'API.
 *
 * Le message ne contient que le numéro de révision, jamais de donnée du tournoi : le client
 * recharge la vue publique. Les surveillances sont comptées et plafonnées (R8).
 */
@Injectable()
export class LiveService implements OnModuleDestroy {
  private readonly watches = new Map<string, Watch>();
  private streams = 0;

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onModuleDestroy(): void {
    for (const watch of this.watches.values()) clearInterval(watch.timer);
    this.watches.clear();
  }

  /** Nombre de connexions ouvertes (pour les tests et la supervision). */
  get openStreams(): number {
    return this.streams;
  }

  private count(tournamentId: string): Promise<number> {
    return this.prisma.tournamentEvent.count({ where: { tournamentId } });
  }

  private async resolve(slug: string): Promise<string> {
    const t = await this.prisma.tournament.findUnique({
      where: { publicSlug: slug },
      select: { id: true },
    });
    if (!t) throw new NotFoundException('Tournoi introuvable');
    return t.id;
  }

  /** Ouvre le flux : le tournoi doit exister et les plafonds ne doivent pas être atteints. */
  async stream(slug: string): Promise<Observable<LiveMessage>> {
    const tournamentId = await this.resolve(slug);
    const existing = this.watches.get(tournamentId);
    if (
      this.streams >= MAX_STREAMS ||
      (existing?.listeners.size ?? 0) >= MAX_STREAMS_PER_TOURNAMENT
    ) {
      throw new HttpException('Trop de connexions en direct', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const initial = existing?.revision ?? (await this.count(tournamentId));

    return new Observable<LiveMessage>((subscriber) => {
      const send: Listener = (revision) => subscriber.next({ type: 'changed', data: { revision } });
      this.streams += 1;
      const watch = this.watch(tournamentId, initial);
      watch.listeners.add(send);
      // Le premier message donne la révision courante : le client sait s'il a raté un changement.
      send(watch.revision);
      const ping = setInterval(() => subscriber.next({ type: 'ping', data: {} }), PING_MS);
      const limit = setTimeout(() => subscriber.complete(), MAX_STREAM_MS);
      return () => {
        clearInterval(ping);
        clearTimeout(limit);
        this.streams -= 1;
        this.unwatch(tournamentId, send);
      };
    });
  }

  private watch(tournamentId: string, initial: number): Watch {
    const known = this.watches.get(tournamentId);
    if (known) return known;
    const watch: Watch = {
      revision: initial,
      listeners: new Set(),
      timer: setInterval(() => {
        void this.count(tournamentId).then(
          (revision) => {
            if (revision === watch.revision) return;
            watch.revision = revision;
            for (const listener of watch.listeners) listener(revision);
          },
          // Base injoignable un instant : on réessaie au prochain tour, sans casser les flux.
          () => undefined,
        );
      }, POLL_MS),
    };
    watch.timer.unref();
    this.watches.set(tournamentId, watch);
    return watch;
  }

  private unwatch(tournamentId: string, listener: Listener): void {
    const watch = this.watches.get(tournamentId);
    if (!watch) return;
    watch.listeners.delete(listener);
    if (watch.listeners.size === 0) {
      clearInterval(watch.timer);
      this.watches.delete(tournamentId);
    }
  }
}
