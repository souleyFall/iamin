import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** L'outil `scripts/logs.mjs` : filtrer des milliers de lignes pour retrouver un incident. */
// Vitest s'exécute depuis apps/api : l'outil est deux dossiers plus haut.
const CLI = resolve(process.cwd(), '../../scripts/logs.mjs');

const now = Date.now();
const line = (o: Record<string, unknown>) =>
  JSON.stringify({ ts: new Date(now).toISOString(), ...o });
const INPUT = [
  line({
    level: 'info',
    ctx: 'Http',
    msg: 'GET /groups 200',
    event: 'http.request',
    method: 'GET',
    route: '/groups',
    status: 200,
    durationMs: 12,
    reqId: 'aaaa1111-0000',
    userId: 'u-1',
  }),
  line({
    level: 'warn',
    ctx: 'Http',
    msg: 'POST /auth/login 401',
    event: 'http.request',
    method: 'POST',
    route: '/auth/login',
    status: 401,
    durationMs: 80,
    error: 'Identifiant ou mot de passe incorrect',
    reqId: 'bbbb2222-0000',
  }),
  line({
    level: 'error',
    ctx: 'Http',
    msg: 'POST /groups : erreur 500',
    event: 'http.error',
    method: 'POST',
    route: '/groups',
    status: 500,
    errorName: 'Error',
    errorMessage: 'boom',
    stack: 'at a | at b',
    reqId: 'cccc3333-0000',
    userId: 'u-2',
  }),
  line({
    level: 'warn',
    ctx: 'Security',
    msg: 'security.account_locked',
    event: 'security.account_locked',
    subject: 'u-2',
  }),
  JSON.stringify({
    ts: new Date(now - 3 * 3_600_000).toISOString(),
    level: 'info',
    msg: 'vieux',
    event: 'app.started',
  }),
  'ceci n’est pas du JSON (sortie de Docker)',
].join('\n');

function run(args: string[]): { out: string; code: number | null } {
  const r = spawnSync(process.execPath, [CLI, ...args], { input: INPUT, encoding: 'utf8' });
  return { out: r.stdout + r.stderr, code: r.status };
}

describe('scripts/logs.mjs', () => {
  it('--level error ne garde que les erreurs', () => {
    const { out } = run(['--level', 'error', '--json']);
    expect(out.trim().split('\n')).toHaveLength(1);
    expect(out).toContain('erreur 500');
  });

  it('--level warn garde avertissements et erreurs', () => {
    expect(run(['--level', 'warn', '--json']).out.trim().split('\n')).toHaveLength(3);
  });

  it('--req retrouve toutes les lignes d’une requête', () => {
    const { out } = run(['--req', 'cccc3333-0000', '--json']);
    expect(out.trim().split('\n')).toHaveLength(1);
    expect(out).toContain('cccc3333-0000');
  });

  it('--user retrouve un compte, y compris comme sujet d’un événement de sécurité', () => {
    expect(run(['--user', 'u-2', '--json']).out.trim().split('\n')).toHaveLength(2);
  });

  it('--event accepte un préfixe', () => {
    const { out } = run(['--event', 'security.', '--json']);
    expect(out.trim().split('\n')).toHaveLength(1);
    expect(out).toContain('account_locked');
  });

  it('--status accepte un code exact ou une famille', () => {
    expect(run(['--status', '401', '--json']).out.trim().split('\n')).toHaveLength(1);
    expect(run(['--status', '5xx', '--json']).out.trim().split('\n')).toHaveLength(1);
    expect(run(['--status', '4xx', '--json']).out.trim().split('\n')).toHaveLength(1);
  });

  it('--route et --grep filtrent sur la route et le texte', () => {
    expect(run(['--route', '/auth', '--json']).out.trim().split('\n')).toHaveLength(1);
    expect(run(['--grep', 'MOT DE PASSE', '--json']).out.trim().split('\n')).toHaveLength(1);
  });

  it('--since écarte les lignes trop anciennes', () => {
    const { out } = run(['--since', '1h', '--json']);
    expect(out).not.toContain('vieux');
    expect(run(['--since', '1d', '--json']).out).toContain('vieux');
  });

  it('ignore les lignes qui ne sont pas du JSON, sauf avec --raw', () => {
    expect(run(['--json']).out).not.toContain('sortie de Docker');
    expect(run(['--raw']).out).toContain('sortie de Docker');
  });

  it('met en forme lisiblement : heure, niveau, message, référence', () => {
    const { out } = run(['--level', 'error']);
    expect(out).toMatch(/ERROR/);
    expect(out).toContain('POST /groups : erreur 500');
    expect(out).toContain('réf. cccc3333');
  });

  it('--summary donne le bilan : niveaux, erreurs fréquentes, routes lentes', () => {
    const { out } = run(['--summary']);
    expect(out).toContain('Par niveau');
    expect(out).toContain('POST /groups 500');
    expect(out).toContain('Routes les plus lentes');
  });

  it('refuse une option invalide avec un message clair', () => {
    const { out, code } = run(['--level', 'bavard']);
    expect(code).toBe(2);
    expect(out).toContain('--level');
  });
});
