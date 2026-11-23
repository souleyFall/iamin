import type { Standings } from '../api/types';

/** Classement d'une ligue. Partagé par l'écran admin et la page publique. */
export function StandingsTable({
  standings,
  nameOf,
}: {
  standings: Standings;
  nameOf: (id: string | null) => string;
}) {
  return (
    <section aria-labelledby="standings">
      <h2 id="standings" className="section-title">
        Classement ({standings.played}/{standings.total})
      </h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
        <thead>
          <tr className="muted" style={{ textAlign: 'left', fontSize: 13 }}>
            <th scope="col">#</th>
            <th scope="col">Joueur</th>
            <th scope="col">Pts</th>
            <th scope="col">V-D</th>
            <th scope="col">Diff</th>
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
              <td>
                {r.wins}-{r.losses}
              </td>
              <td>{r.scoreDiff > 0 ? `+${r.scoreDiff}` : r.scoreDiff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
