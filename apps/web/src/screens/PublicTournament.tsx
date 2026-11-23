import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
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
import { LanguagePicker } from '../components/LanguagePicker';
import { ErrorNote } from '../components/ErrorNote';
import { defaultRound, MatchContent, RoundTabs, roundsOf } from '../components/Rounds';
import { StandingsTable } from '../components/StandingsTable';
import { I18nProvider, useI18n } from '../lib/i18n';
import type { MessageKey } from '../lib/i18n/messages';
import { FORMAT_KEY, STATUS_CLASS, STATUS_KEY, initialOf } from '../lib/labels';
import { clearPlayerToken, readPlayerToken } from '../lib/player-token';

const MY_STATUS: Record<string, MessageKey> = {
  PENDING: 'pub.mine.PENDING',
  ACCEPTED: 'pub.mine.ACCEPTED',
  REPLACED: 'pub.mine.REPLACED',
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
  const { t } = useI18n();
  const mine = useMyRegistration(slug, token);
  const withdraw = useWithdraw(slug, token, onGone);

  if (mine.error instanceof ApiError && mine.error.status === 404) {
    // Lien périmé (inscription refusée ou supprimée par un admin) : on repart d'un formulaire neuf.
    return (
      <div className="panel">
        <p>{t('pub.mine.gone')}</p>
        <button type="button" className="btn" onClick={onGone}>
          {t('pub.mine.ok')}
        </button>
      </div>
    );
  }
  if (!mine.data) {
    return mine.error ? (
      <ErrorNote error={mine.error} />
    ) : (
      <p className="muted" role="status">
        {t('pub.mine.loading')}
      </p>
    );
  }
  const m = mine.data;
  const text =
    m.status === 'WAITLIST'
      ? m.waitlistPosition
        ? t('pub.mine.waitlistPos', { n: m.waitlistPosition })
        : t('pub.mine.waitlist')
      : MY_STATUS[m.status]
        ? t(MY_STATUS[m.status] as MessageKey)
        : '';
  return (
    <div className="panel" aria-labelledby="mine-title">
      <h2 id="mine-title" className="section-title">
        {t('pub.mine.title')}
      </h2>
      <p className="player-row" style={{ border: 0, padding: 0 }}>
        <span className="avatar">{initialOf(m.platoName)}</span>
        <span className="player-name">{m.platoName}</span>
      </p>
      <p className={m.status === 'ACCEPTED' ? 'notice notice-ok' : 'notice'}>{text}</p>
      {m.presence === 'PRESENT' && <p className="muted">{t('pub.mine.present')}</p>}
      {(m.tournament.status === 'REGISTRATION' || m.tournament.status === 'CHECK_IN') && (
        <ConfirmButton
          confirmLabel={t('pub.mine.withdrawConfirm')}
          onConfirm={() => withdraw.mutate()}
          disabled={withdraw.isPending}
        >
          {t('pub.mine.withdraw')}
        </ConfirmButton>
      )}
      <ErrorNote error={withdraw.error} />
    </div>
  );
}

function RegisterForm({ slug, onToken }: { slug: string; onToken: (token: string) => void }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const register = useRegister(slug, onToken);

  function submit(event: FormEvent) {
    event.preventDefault();
    register.mutate(name.trim());
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2 className="section-title">{t('pub.register.title')}</h2>
      <div className="field">
        <label htmlFor="plato-name">{t('pub.register.name')}</label>
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
        <p className="hint">{t('pub.register.hint')}</p>
      </div>
      <button
        className="key key-wide"
        type="submit"
        disabled={register.isPending || name.trim() === ''}
      >
        {t('pub.register.submit')}
      </button>
      <ErrorNote error={register.error} />
    </form>
  );
}

function Results({ view }: { view: PublicView }) {
  const { t } = useI18n();
  const [picked, setPicked] = useState<number | null>(null);
  const draw = drawOf(view);
  if (!draw || !view.drawn) return null;
  const names: Record<string, string> = {};
  for (const p of draw.players) names[p.id] = p.platoName;
  const nameOf = (id: string | null) => (id === null ? t('match.tbd') : (names[id] ?? id));
  const rounds = roundsOf(draw, t);
  const index = Math.min(picked ?? defaultRound(rounds), rounds.length - 1);
  const round = rounds[index];
  if (!round) return null;
  return (
    <section aria-label={t('pub.matches')} style={{ display: 'flex', flexDirection: 'column' }}>
      <RoundTabs rounds={rounds} index={index} onPick={setPicked} />
      <div className="page" style={{ paddingTop: 8 }}>
        {isBracketView(draw) && draw.champion && (
          <p className="card notice notice-ok">
            {t('play.champion', { name: nameOf(draw.champion) })}
          </p>
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
        {round.rest && <p className="muted">{t('play.rest', { name: nameOf(round.rest) })}</p>}
        {!isBracketView(draw) && <StandingsTable standings={draw.standings} nameOf={nameOf} />}
        {draw.seed && (
          <details className="panel fold">
            <summary className="section-title">{t('pub.verify')}</summary>
            <p className="muted">{t('pub.verifyHint')}</p>
            <code style={{ overflowWrap: 'anywhere' }}>{draw.seed}</code>
          </details>
        )}
      </div>
    </section>
  );
}

/** Page publique d'un tournoi : inscription, suivi de son statut et direct. Aucun compte requis. */
export function PublicTournament() {
  const { t } = useI18n();
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
          {t('pub.notFound')}
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
        {t('common.loading')}
      </p>
    );
  }

  return (
    // La page prend la langue du tournoi (choisie par l'admin), sauf si le joueur a choisi la sienne.
    <I18nProvider defaultLocale={view.data.language}>
      <PublicContent
        slug={slug}
        v={view.data}
        live={live}
        token={token}
        onToken={setToken}
        onGone={forget}
      />
    </I18nProvider>
  );
}

function PublicContent({
  slug,
  v,
  live,
  token,
  onToken,
  onGone,
}: {
  slug: string;
  v: PublicView;
  live: boolean;
  token: string | null;
  onToken: (token: string) => void;
  onGone: () => void;
}) {
  const { t } = useI18n();
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
              {t(FORMAT_KEY[v.format])} ·{' '}
              <span className={STATUS_CLASS[v.status]}>{t(STATUS_KEY[v.status])}</span>
            </p>
          </div>
          {live && (
            <span className="tag tag-live" role="status">
              {t('pub.live')}
            </span>
          )}
        </header>

        <div className="page" style={{ paddingTop: 8 }}>
          {token !== null ? (
            <MyRegistrationCard slug={slug} token={token} onGone={onGone} />
          ) : v.registrationOpen ? (
            <RegisterForm slug={slug} onToken={onToken} />
          ) : (
            !v.drawn && <p className="card">{t('pub.closed')}</p>
          )}
        </div>

        {v.drawn ? (
          <Results view={v} />
        ) : (
          <div className="page">
            <section aria-labelledby="players-title">
              <h2 id="players-title" className="section-title">
                {t('pub.players', { n: accepted.length })}
              </h2>
              {accepted.length === 0 && <p className="muted">{t('pub.nobody')}</p>}
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
                  {t('pub.waitlist', { n: waitlist.length })}
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

        <div className="page" style={{ marginTop: 'auto' }}>
          <LanguagePicker compact />
          <p className="notice-standalone">
            {t('common.disclaimer')} <Link to="/avis">{t('fb.title')}</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
