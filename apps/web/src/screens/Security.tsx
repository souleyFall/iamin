import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { MfaSetup, MfaStatus } from '../api/types';
import { useAuth } from '../auth/session';
import { ConfirmButton } from '../components/ConfirmButton';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { QrCode } from '../components/QrCode';
import { ActivityPanel, SessionsPanel } from '../components/SecurityPanels';
import { copyText } from '../lib/chat';

const STATUS = ['mfa-status'] as const;

/** Le secret en base32 se lit mieux par groupes de 4. */
const grouped = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

/** Codes de secours : visibles une seule fois, à garder ailleurs que sur le téléphone. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [copied, setCopied] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <section className="panel" aria-labelledby="recovery-title">
      <h2 id="recovery-title" className="section-title">
        Codes de secours
      </h2>
      <p className="notice notice-bad">
        Ils ne s’afficheront plus. Chacun sert une seule fois si tu perds ton téléphone. Garde-les
        dans un gestionnaire de mots de passe ou sur papier, pas sur le téléphone.
      </p>
      <ul className="rows" style={{ columns: 2 }}>
        {codes.map((c) => (
          <li key={c}>
            <code className="tabular">{c}</code>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn"
        onClick={() => void copyText(codes.join('\n')).then(setCopied)}
      >
        Copier les codes
      </button>
      {copied === true && <p className="notice notice-ok">Codes copiés.</p>}
      {copied === false && (
        <p className="notice notice-bad">Copie refusée : recopie-les à la main.</p>
      )}
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        J’ai gardé mes codes de secours
      </label>
      <button type="button" className="key key-wide" disabled={!saved} onClick={onDone}>
        Terminer
      </button>
    </section>
  );
}

/** Activation : scanner le QR code, donner un premier code, recevoir les codes de secours. */
function Enable({ onEnabled }: { onEnabled: (codes: string[]) => void }) {
  const { refresh } = useAuth();
  const [code, setCode] = useState('');
  const setup = useMutation({ mutationFn: () => api<MfaSetup>('POST', '/auth/mfa/setup') });
  const enable = useMutation({
    mutationFn: () =>
      api<{ recoveryCodes: string[] }>('POST', '/auth/mfa/enable', { code: code.trim() }),
    onSuccess: async (r) => {
      await refresh();
      onEnabled(r.recoveryCodes);
    },
  });

  if (!setup.data) {
    return (
      <section className="panel">
        <h2 className="section-title">Activer la double authentification</h2>
        <p>
          À chaque connexion, en plus du mot de passe, tu donneras un code à 6 chiffres qui change
          toutes les 30 secondes. Il faut une application d’authentification sur ton téléphone :
          Microsoft Authenticator, Google Authenticator, Aegis ou 2FAS.
        </p>
        <ErrorNote error={setup.error} />
        <button
          type="button"
          className="key key-wide"
          disabled={setup.isPending}
          onClick={() => setup.mutate()}
        >
          Commencer
        </button>
      </section>
    );
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    enable.mutate();
  }

  return (
    <form className="panel" onSubmit={submit}>
      <h2 className="section-title">1. Scanne le QR code</h2>
      <p className="hint">
        Dans l’application : « Ajouter un compte », puis « Scanner un code QR ».
      </p>
      <QrCode
        value={setup.data.otpauthUrl}
        label="QR code à scanner avec l’application d’authentification"
      />
      <details>
        <summary>Le QR code ne se scanne pas ?</summary>
        <p className="hint">Saisis cette clé à la main (type « basé sur l’heure ») :</p>
        <code className="tabular" style={{ overflowWrap: 'anywhere' }}>
          {grouped(setup.data.secret)}
        </code>
      </details>
      <h2 className="section-title">2. Donne le premier code</h2>
      <div className="field">
        <label htmlFor="enable-code">Code à 6 chiffres</label>
        <input
          id="enable-code"
          className="input tabular"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          required
        />
      </div>
      <ErrorNote error={enable.error} />
      <button
        className="key key-wide"
        type="submit"
        disabled={enable.isPending || code.trim().length < 6}
      >
        Activer
      </button>
    </form>
  );
}

/** Déjà active : état, nouveaux codes de secours, et désactivation pour les comptes ordinaires. */
function Active({ status, onCodes }: { status: MfaStatus; onCodes: (codes: string[]) => void }) {
  const { refresh } = useAuth();
  const client = useQueryClient();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const regenerate = useMutation({
    mutationFn: () =>
      api<{ recoveryCodes: string[] }>('POST', '/auth/mfa/recovery-codes', { code: code.trim() }),
    onSuccess: (r) => {
      setCode('');
      void client.invalidateQueries({ queryKey: STATUS });
      onCodes(r.recoveryCodes);
    },
  });
  const disable = useMutation({
    mutationFn: () => api<void>('POST', '/auth/mfa/disable', { password, code: code.trim() }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: STATUS });
      await refresh();
    },
  });

  return (
    <section className="panel">
      <h2 className="section-title">Double authentification</h2>
      <p>
        <span className="tag tag-ok">ACTIVE</span>{' '}
        <span className="muted">
          {status.recoveryCodesLeft} code{status.recoveryCodesLeft > 1 ? 's' : ''} de secours
          restant{status.recoveryCodesLeft > 1 ? 's' : ''}
        </span>
      </p>
      {status.recoveryCodesLeft <= 3 && (
        <p className="notice notice-bad">
          Il t’en reste peu : génère de nouveaux codes de secours.
        </p>
      )}
      <div className="field">
        <label htmlFor="mfa-code">Code à 6 chiffres</label>
        <input
          id="mfa-code"
          className="input tabular"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
        />
        <p className="hint">Demandé pour les deux actions ci-dessous.</p>
      </div>
      <ErrorNote error={regenerate.error ?? disable.error} />
      <button
        type="button"
        className="btn btn-accent"
        disabled={regenerate.isPending || code.trim().length < 6}
        onClick={() => regenerate.mutate()}
      >
        Générer de nouveaux codes de secours
      </button>
      {status.required ? (
        <p className="hint">
          La double authentification est obligatoire pour ton compte : elle ne se désactive pas ici.
        </p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="mfa-password">Mot de passe (pour désactiver)</label>
            <input
              id="mfa-password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <ConfirmButton
            confirmLabel="Désactiver"
            disabled={disable.isPending || code.trim().length < 6 || password === ''}
            onConfirm={() => disable.mutate()}
          >
            Désactiver la double authentification
          </ConfirmButton>
        </>
      )}
    </section>
  );
}

/** Écran Sécurité : activer, gérer la double authentification (obligatoire pour le propriétaire). */
export function Security() {
  const { user } = useAuth();
  const status = useQuery({
    queryKey: STATUS,
    queryFn: () => api<MfaStatus>('GET', '/auth/mfa'),
  });
  const [codes, setCodes] = useState<string[] | null>(null);
  const client = useQueryClient();
  const mustEnable = user?.role === 'PLATFORM_OWNER' && status.data?.enabled === false;

  return (
    <>
      <header className="topbar">
        {!mustEnable && (
          <Link className="icon-btn flat" to="/moi" aria-label="Retour">
            <Icon name="back" size={24} />
          </Link>
        )}
        <h1 className="title">Sécurité</h1>
      </header>
      <div className="page page-wide panels-grid">
        {mustEnable && (
          <p className="notice notice-bad desk-full" role="status">
            La double authentification est obligatoire pour le propriétaire de la plateforme.
            Active-la pour continuer.
          </p>
        )}
        <ErrorNote error={status.error} />
        {codes ? (
          <RecoveryCodes
            codes={codes}
            onDone={() => {
              setCodes(null);
              void client.invalidateQueries({ queryKey: STATUS });
            }}
          />
        ) : status.data?.enabled ? (
          <Active status={status.data} onCodes={setCodes} />
        ) : status.data ? (
          <Enable onEnabled={setCodes} />
        ) : null}
        {!codes && !mustEnable && status.data && (
          <>
            <SessionsPanel />
            <ActivityPanel />
          </>
        )}
      </div>
    </>
  );
}
