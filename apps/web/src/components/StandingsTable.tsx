import type { Standings } from '../api/types';
import { useI18n } from '../lib/i18n';

/** Classement d'une ligue. Partagé par l'écran admin et la page publique. */
export function StandingsTable({
  standings,
  nameOf,
}: {
  standings: Standings;
  nameOf: (id: string | null) => string;
}) {
  const { t } = useI18n();
  // La colonne des nuls n'apparaît que s'il y en a : une ligue sans nul garde V-D.
  const withDraws = standings.rows.some((r) => r.draws > 0);
  return (
    <section aria-labelledby="standings">
      <h2 id="standings" className="section-title">
        {t('standings.title', { played: standings.played, total: standings.total })}
      </h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
        <thead>
          <tr className="muted" style={{ textAlign: 'left', fontSize: 13 }}>
            <th scope="col">#</th>
            <th scope="col">{t('standings.player')}</th>
            <th scope="col">{t('standings.points')}</th>
            <th scope="col">{t(withDraws ? 'standings.recordDraws' : 'standings.record')}</th>
            <th scope="col">{t('standings.diff')}</th>
          </tr>
        </thead>
        <tbody>
          {standings.rows.map((r) => (
            <tr
              key={r.playerId}
              className="tabular"
              style={{ borderTop: '1px solid var(--line)', height: 40 }}
            >
              <td>{r.rank}</td>
              <th scope="row" style={{ textAlign: 'left', fontWeight: 600 }}>
                {nameOf(r.playerId)}
              </th>
              <td>{r.points}</td>
              <td>{withDraws ? `${r.wins}-${r.draws}-${r.losses}` : `${r.wins}-${r.losses}`}</td>
              <td>{r.scoreDiff > 0 ? `+${r.scoreDiff}` : r.scoreDiff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
