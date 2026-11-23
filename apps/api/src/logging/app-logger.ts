import type { LoggerService } from '@nestjs/common';
import { currentContext } from './context';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogLevelSetting = LogLevel | 'silent';

const RANK: Record<LogLevelSetting, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 99,
};

/** Un champ dont le nom évoque un secret n'est jamais écrit (mot de passe, jeton, cookie, code…). */
const SECRET_KEY = /pass|token|secret|cookie|authorization|csrf|totp|otp|hash|recovery|^code$/i;
const MAX_TEXT = 500;

export type Sink = (line: string, level: LogLevel) => void;

const stdoutSink: Sink = (line, level) => {
  (level === 'error' ? process.stderr : process.stdout).write(`${line}\n`);
};

/** Un texte libre ne doit ni casser la ligne JSON ni gonfler le journal. */
export function clean(text: string, max = MAX_TEXT): string {
  // eslint-disable-next-line no-control-regex -- on retire justement les caractères de contrôle
  const flat = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function sanitize(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return clean(value);
  if (value === null || typeof value !== 'object') return value;
  if (depth >= 3) return '[…]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) ? '[masqué]' : sanitize(v, depth + 1);
  }
  return out;
}

/**
 * Journal de l'application : une ligne JSON par événement sur la sortie standard (Docker la garde et
 * la fait tourner). Chaque ligne porte l'heure, le niveau, le contexte, un message et, pendant une
 * requête, son identifiant (`reqId`) et le compte concerné (`userId`, jamais son nom ni son adresse IP).
 *
 * Règle de confidentialité (D21, D28) : jamais d'adresse IP, de mot de passe, de jeton, de cookie ni
 * de corps de requête. Les champs dont le nom évoque un secret sont masqués d'office.
 */
export class AppLogger implements LoggerService {
  constructor(
    private level: LogLevelSetting = 'info',
    private sink: Sink = stdoutSink,
  ) {}

  configure(level: LogLevelSetting, sink: Sink = stdoutSink): void {
    this.level = level;
    this.sink = sink;
  }

  write(level: LogLevel, context: string, msg: string, fields: Record<string, unknown> = {}): void {
    if (RANK[level] < RANK[this.level]) return;
    const ctx = currentContext();
    const record = {
      ts: new Date().toISOString(),
      level,
      ctx: context,
      msg: clean(msg),
      ...(ctx ? { reqId: ctx.reqId, ...(ctx.userId ? { userId: ctx.userId } : {}) } : {}),
      ...(sanitize(fields) as Record<string, unknown>),
    };
    this.sink(JSON.stringify(record), level);
  }

  /** Un événement nommé (`auth.login`, `tournament.drawn`…) : le nom sert à filtrer et à compter. */
  event(
    event: string,
    fields: Record<string, unknown> = {},
    level: LogLevel = 'info',
    context = 'Event',
  ): void {
    this.write(level, context, event, { event, ...fields });
  }

  // Interface LoggerService de Nest : les journaux du framework passent par le même format.
  log(message: unknown, context?: string): void {
    this.write('info', context ?? 'Nest', String(message));
  }
  error(message: unknown, ...rest: unknown[]): void {
    const [first, second] = rest;
    // Nest appelle error(message, stack, context) ; un second texte est le contexte.
    const stack = typeof first === 'string' && typeof second === 'string' ? first : undefined;
    const context =
      typeof second === 'string' ? second : typeof first === 'string' ? first : 'Nest';
    this.write('error', context, String(message), stack ? { stack: clean(stack, 4000) } : {});
  }
  warn(message: unknown, context?: string): void {
    this.write('warn', context ?? 'Nest', String(message));
  }
  debug(message: unknown, context?: string): void {
    this.write('debug', context ?? 'Nest', String(message));
  }
  verbose(message: unknown, context?: string): void {
    this.write('debug', context ?? 'Nest', String(message));
  }
}

/** Le journal unique de l'application ; `configure` le règle au démarrage (niveau, destination). */
export const logger = new AppLogger('info');

/**
 * Décrit une erreur pour le journal sans y mettre de données : les erreurs de la base citent la
 * requête et ses valeurs dans leur message, on n'en garde donc que le code et la cible.
 */
export function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const named = error as Error & { code?: unknown; meta?: unknown };
    const prisma = named.name.startsWith('PrismaClient');
    const meta =
      prisma && typeof named.meta === 'object' && named.meta !== null
        ? (named.meta as { target?: unknown; modelName?: unknown })
        : undefined;
    return {
      errorName: named.name,
      ...(typeof named.code === 'string' ? { errorCode: named.code } : {}),
      ...(meta ? { errorTarget: meta.target ?? meta.modelName } : {}),
      errorMessage: prisma ? '(détail de la base non journalisé)' : clean(named.message),
      // Seulement les lignes « at … » : la première ligne de la trace répète le message (donc les valeurs).
      stack: error.stack
        ? clean(
            error.stack
              .split('\n')
              .filter((l) => /^\s*at /.test(l))
              .slice(0, 12)
              .join(' | '),
            4000,
          )
        : undefined,
    };
  }
  return { errorName: typeof error, errorMessage: clean(String(error)) };
}
