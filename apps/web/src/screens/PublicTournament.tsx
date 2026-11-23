import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  drawOf,
  useInvalidateView,
  useLive,
  useMyRegistration,
  usePublicView,
  useRegister,
  useWithdraw,
} from '../api/public';
import { isBracketView, type PublicView } from '../api/types';
import { ConfirmButton } from '../components/ConfirmButton';
import { ErrorNote } from '../components/ErrorNote';
import { defaultRound, MatchContent, RoundTabs, roundsOf } from '../components/Rounds';
import { StandingsTable } from '../components/StandingsTable';
import { FORMAT_LABEL, STATUS_CLASS, STATUS_LABEL, initialOf } from '../lib/labels';
import { clearPlayerToken, readPlayerToken } from '../lib/player-token';

const MY_STATUS: Record<string, string> = {
  PENDING: 'En attente de validation par un admin.',
  ACCEPTED: 'Inscription validée. Tu as ta place.',
  REPLACED: 'Tu as été remplacé dans le tirage.',
};

/** Le joueur retrouve son inscription grâce au lien gardé sur son appareil, et peut l'annuler. */
function MyRegistrationCard({
  slug,
  token,
  onGone,
}: {
  slug: string;
  token: string;
  onGone: () => void;
}) {
  const mine = useMyRegistration(slug, token);
  const withdraw = useWithdraw(slug, token, onGone);

  if (mine.error instanceof ApiError && mine.error.status === 404) {
    // Lien périmé (inscription refusée ou supprimée par un admin) : on repart d'un formulaire neuf.
    return (
      <div className="panel">
        <p>Ton inscription n’existe plus. Tu peux t’inscrire à nouveau si c’est encore ouvert.</p>
        <button type="button" className="btn" onClick={onGone}>
          D’accord
        </button>
      </div>
    );
  }
  if (!mine.data) {
    return mine.error ? (
      <ErrorNote error={mine.error} />
    ) : (
      <p className="muted" role="status">
        Chargement de ton inscription…
      </p>
    );
  }
  const m = mine.data;
  const text =
    m.status === 'WAITLIST'
      ? `Liste d’attente${m.waitlistPosition ? ` : tu es n°${m.waitlistPosition}` : ''}. Si une place se libère, tu passes automatiquement.`
      : (MY_STATUS[m.status] ?? '');
  return (
    <div className="panel" aria-labelledby="mine-title">
      <h2 id="mine-title" className="section-title">
        Ton inscription
      </h2>
      <p className="player-row" style={{ border: 0, padding: 0 }}>
        <span className="avatar">{initialOf(m.platoName)}</span>
        <span className="player-name">{m.platoName}</span>
      </p>
      <p className={m.status === 'ACCEPTED' ? 'notice notice-ok' : 'notice'}>{text}</p>
      {m.presence === 'PRESENT' && <p className="muted">Pointé présent.</p>}
      {(m.tournament.status === 'REGISTRATION' || m.tournament.status === 'CHECK_IN') && (
        <ConfirmButton
          confirmLabel="Oui, annuler"
          onConfirm={() => withdraw.mutate()}
          disabled={withdraw.isPending}
        >
          Annuler mon inscription
        </ConfirmButton>
      )}
      <ErrorNote error={withdraw.error} />
    </div>
  );
}

function RegisterForm({ slug, onToken }: { slug: string; onToken: (t: string) => void }) {
  const [name, setName] = useState('');
  const register = useRegister(slug, onToken);

  function submit(event: FormEvent) {
    event.preventDefault();
    register.mutate(name.trim());
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2 className="section-title">T’inscrire</h2>
      <div className="field">
        <label htmlFor="plato-name">Ton pseudo Plato</label>
        <input
          id="plato-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={40}
          required
        />
        <p className="hint">
          Seul ton pseudo est demandé. Un admin valide chaque inscription, puis tu retrouves ton
          statut ici.
        </p>
      </div>
      <button
        className="key key-wide"
        type="submit"
        disabled={register.isPending || name.trim() === ''}
      >
        Envoyer mon inscription
      </button>
      <ErrorNote error={register.error} />
    </form>
  );
}

function Results({ view }: { view: PublicView }) {
  const [picked, setPicked] = useState<number | null>(null);
  const draw = drawOf(view);
  if (!draw || !view.drawn) return null;
  const names: Record<string, string> = {};
  for (const p of draw.players) names[p.id] = p.platoName;
  const nameOf = (id: string | null) => (id === null ? 'à déterminer' : (names[id] ?? id));
  const rounds = roundsOf(draw);
  const index = Math.min(picked ?? defaultRound(rounds), rounds.length - 1);
  const round = rounds[index];
  if (!round) return null;
  return (
    <section aria-label="Matchs" style={{ display: 'flex', flexDirection: 'column' }}>
      <RoundTabs rounds={rounds} index={index} onPick={setPicked} />
      <div className="page" style={{ paddingTop: 8 }}>
        {isBracketView(draw) && draw.champion && (
          <p className="card notice notice-ok">Vainqueur du tournoi : {nameOf(draw.champion)}</p>
        )}
        <ul>
          {round.lines.map((l, i) => (
            <li key={l.code}>
              <div className="match">
                <MatchContent line={l} position={i + 1} nameOf={nameOf} />
              </div>
            </li>
          ))}
        </ul>
        {round.rest && <p className="muted">Repos : {nameOf(round.rest)}</p>}
        {!isBracketView(draw) && <StandingsTable standings={draw.standings} nameOf={nameOf} />}
        {draw.seed && (
          <details className="panel fold">
            <summary className="section-title">Vérifier le tirage</summary>
            <p className="muted">
              Avec la même liste de joueurs et cette graine, le tirage se refait à l’identique.
            </p>
            <code style={{ overflowWrap: 'anywhere' }}>{draw.seed}</code>
          </details>
        )}
      </div>
    </section>
  );
}

/** Page publique d'un tournoi : inscription, suivi de son statut et direct. Aucun compte requis. */
export function PublicTournament() {
  const { slug = '' } = useParams();
  const view = usePublicView(slug);
  const refresh = useInvalidateView(slug);
  const live = useLive(slug, refresh);
  const [token, setToken] = useState<string | null>(() => readPlayerToken(slug));

  function forget() {
    clearPlayerToken(slug);
    setToken(null);
  }

  if (view.error instanceof ApiError && view.error.status === 404) {
    return (
      <main className="login">
        <div className="logo">i-am-in</div>
        <p className="panel" role="alert">
          Ce lien ne correspond à aucun tournoi. Vérifie-le auprès de l’admin qui te l’a envoyé.
        </p>
      </main>
    );
  }
  if (!view.data) {
    return view.error ? (
      <main className="login">
        <div className="logo">i-am-in</div>
        <ErrorNote error={view.error} />
      </main>
    ) : (
      <p className="page muted" role="status">
        Chargement…
      </p>
    );
  }

  const v = view.data;
  const players = v.drawn ? [] : v.players;
  const accepted = players.filter((p) => p.status === 'ACCEPTED');
  const waitlist = players.filter((p) => p.status === 'WAITLIST');

  return (
    <div className="shell">
      <main className="shell-main">
        <header className="topbar">
          <div className="topbar-title">
            <h1 className="title">{v.name}</h1>
            <p className="subtitle">
              {FORMAT_LABEL[v.format]} ·{' '}
              <span className={STATUS_CLASS[v.status]}>{STATUS_LABEL[v.status]}</span>
            </p>
          </div>
          {live && (
            <span className="tag tag-live" role="status">
              EN DIRECT
            </span>
          )}
        </header>

        <div className="page" style={{ paddingTop: 8 }}>
          {token !== null ? (
            <MyRegistrationCard slug={slug} token={token} onGone={forget} />
          ) : v.registrationOpen ? (
            <RegisterForm slug={slug} onToken={setToken} />
          ) : (
            !v.drawn && <p className="card">Les inscriptions sont closes.</p>
          )}
        </div>

        {v.drawn ? (
          <Results view={v} />
        ) : (
          <div className="page">
            <section aria-labelledby="players-title">
              <h2 id="players-title" className="section-title">
                Inscrits · {accepted.length}
              </h2>
              {accepted.length === 0 && <p className="muted">Personne n’est encore validé.</p>}
              <ul>
                {accepted.map((p) => (
                  <li key={p.id} className="player-row">
                    <span className="avatar">{initialOf(p.platoName)}</span>
                    <span className="player-name">{p.platoName}</span>
                  </li>
                ))}
              </ul>
            </section>
            {waitlist.length > 0 && (
              <section aria-labelledby="wait-title">
                <h2 id="wait-title" className="section-title">
                  Liste d’attente · {waitlist.length}
                </h2>
                <ul>
                  {waitlist.map((p) => (
                    <li key={p.id} className="player-row">
                      <span className="avatar">{initialOf(p.platoName)}</span>
                      <span className="player-name">{p.platoName}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        <p className="notice-standalone" style={{ marginTop: 'auto', padding: '16px 20px' }}>
          i-am-in est un outil indépendant, non affilié à Plato.
        </p>
      </main>
    </div>
  );
}
