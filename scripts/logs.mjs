#!/usr/bin/env node
// Lit le journal JSON de l'API (une ligne par événement) et ne garde que ce qu'on cherche.
//
//   docker compose -f docker-compose.prod.yml logs api --no-log-prefix --since 1h | node scripts/logs.mjs --level error
//
// Options (toutes combinables) :
//   --level warn|error|info|debug   niveau minimal                  (défaut : tout)
//   --event auth.login              événement ; un préfixe suffit (security. = tous les événements de sécurité)
//   --req <id>                      toutes les lignes d'une requête (l'identifiant « réf. » vu à l'écran)
//   --user <id>                     toutes les lignes d'un compte
//   --route <texte>                 route qui contient ce texte      (ex. /groups, /auth/login)
//   --status 500 | 4xx | 5xx        code de réponse
//   --since 30m | 2h | 1d           période récente
//   --grep <texte>                  texte libre dans le message ou l'erreur
//   --summary                       au lieu des lignes : un bilan (compte par niveau, erreurs fréquentes, routes lentes)
//   --json                          lignes JSON brutes (pour jq) au lieu de la mise en forme
//
// Les lignes qui ne sont pas du JSON (sortie de Docker, de Prisma…) sont ignorées, sauf avec --raw.
import { createInterface } from 'node:readline';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const UNIT = { m: 60_000, h: 3_600_000, d: 86_400_000 };

export function parseArgs(argv) {
  const opts = {};
  const flags = new Set(['summary', 'json', 'raw', 'help']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new Error(`Argument inattendu : ${arg}`);
    const name = arg.slice(2);
    if (flags.has(name)) opts[name] = true;
    else {
      const value = argv[++i];
      if (value === undefined) throw new Error(`--${name} demande une valeur`);
      opts[name] = value;
    }
  }
  if (opts.level && !(opts.level in LEVELS))
    throw new Error('--level : debug, info, warn ou error');
  if (opts.since && !/^\d+[mhd]$/.test(opts.since)) throw new Error('--since : 30m, 2h ou 1d');
  if (opts.status && !/^([1-5]\d\d|[1-5]xx)$/.test(opts.status)) {
    throw new Error('--status : 500, 404, 4xx ou 5xx');
  }
  return opts;
}

/** Vrai si la ligne (objet JSON) correspond à tous les filtres demandés. */
export function matches(entry, opts, now = Date.now()) {
  if (opts.level && (LEVELS[entry.level] ?? 0) < LEVELS[opts.level]) return false;
  if (opts.event && !String(entry.event ?? '').startsWith(opts.event)) return false;
  if (opts.req && entry.reqId !== opts.req) return false;
  if (opts.user && entry.userId !== opts.user && entry.subject !== opts.user) return false;
  if (opts.route && !String(entry.route ?? '').includes(opts.route)) return false;
  if (opts.status) {
    const status = String(entry.status ?? '');
    if (opts.status.endsWith('xx') ? status[0] !== opts.status[0] : status !== opts.status)
      return false;
  }
  if (opts.since) {
    const span = Number(opts.since.slice(0, -1)) * UNIT[opts.since.slice(-1)];
    const at = Date.parse(entry.ts);
    if (!Number.isFinite(at) || at < now - span) return false;
  }
  if (opts.grep) {
    const hay = `${entry.msg ?? ''} ${entry.error ?? ''} ${entry.errorMessage ?? ''}`.toLowerCase();
    if (!hay.includes(opts.grep.toLowerCase())) return false;
  }
  return true;
}

const COLORS = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[90m' };
const RESET = '\x1b[0m';
const DIM = '\x1b[90m';

/** Une ligne lisible : heure, niveau, message, puis les détails utiles. */
export function format(entry, color = true) {
  const paint = (code, text) => (color ? `${code}${text}${RESET}` : text);
  const time = String(entry.ts ?? '').slice(11, 23);
  const level = paint(
    COLORS[entry.level] ?? '',
    String(entry.level ?? '?')
      .toUpperCase()
      .padEnd(5),
  );
  const extras = [];
  if (entry.durationMs !== undefined) extras.push(`${entry.durationMs} ms`);
  if (entry.error) extras.push(`« ${entry.error} »`);
  if (entry.errorName)
    extras.push(`${entry.errorName}${entry.errorCode ? `/${entry.errorCode}` : ''}`);
  if (entry.errorMessage && !entry.error) extras.push(`« ${entry.errorMessage} »`);
  if (entry.userId) extras.push(`compte ${String(entry.userId).slice(0, 8)}`);
  if (entry.reqId) extras.push(`réf. ${String(entry.reqId).slice(0, 8)}`);
  const tail = extras.length ? paint(DIM, ` · ${extras.join(' · ')}`) : '';
  const stack = entry.stack
    ? `\n        ${paint(DIM, String(entry.stack).split(' | ').join('\n        '))}`
    : '';
  return `${paint(DIM, time)} ${level} ${entry.msg ?? ''}${tail}${stack}`;
}

/** Bilan : combien de lignes par niveau, les erreurs les plus fréquentes et les routes les plus lentes. */
export function summarize(entries) {
  const count = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
  const levels = new Map();
  const errors = new Map();
  const events = new Map();
  const slow = new Map();
  for (const e of entries) {
    count(levels, e.level ?? '?');
    if (e.event && e.event !== 'http.request') count(events, e.event);
    if (e.level === 'error' || e.level === 'warn') {
      count(
        errors,
        `${e.level} ${e.route ? `${e.method} ${e.route} ` : ''}${e.status ?? ''} ${e.error ?? e.errorMessage ?? e.msg ?? ''}`.trim(),
      );
    }
    if (e.event === 'http.request' && typeof e.durationMs === 'number') {
      const key = `${e.method} ${e.route}`;
      const s = slow.get(key) ?? { n: 0, total: 0, max: 0 };
      s.n++;
      s.total += e.durationMs;
      s.max = Math.max(s.max, e.durationMs);
      slow.set(key, s);
    }
  }
  const top = (map, n = 8) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const lines = [`${entries.length} lignes`, ''];
  lines.push(
    'Par niveau :',
    ...top(levels).map(([k, v]) => `  ${String(v).padStart(6)}  ${k}`),
    '',
  );
  if (errors.size)
    lines.push(
      'Erreurs et avertissements les plus fréquents :',
      ...top(errors).map(([k, v]) => `  ${String(v).padStart(6)}  ${k}`),
      '',
    );
  if (events.size)
    lines.push(
      'Événements :',
      ...top(events).map(([k, v]) => `  ${String(v).padStart(6)}  ${k}`),
      '',
    );
  const slowest = [...slow.entries()]
    .map(([k, s]) => [k, s.total / s.n, s.max, s.n])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  if (slowest.length) {
    lines.push('Routes les plus lentes (moyenne, maximum, appels) :');
    for (const [k, avg, max, n] of slowest)
      lines.push(`  ${avg.toFixed(1).padStart(8)} ms  max ${max} ms  ×${n}  ${k}`);
  }
  return lines.join('\n');
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  if (opts.help) {
    console.log("Voir l'en-tête de scripts/logs.mjs.");
    return;
  }
  const kept = [];
  const rl = createInterface({ input: process.stdin });
  const color = process.stdout.isTTY === true;
  for await (const line of rl) {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      if (opts.raw) console.log(line);
      continue;
    }
    if (typeof entry !== 'object' || entry === null || !matches(entry, opts)) continue;
    if (opts.summary) kept.push(entry);
    else console.log(opts.json ? line : format(entry, color));
  }
  if (opts.summary) console.log(summarize(kept));
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
