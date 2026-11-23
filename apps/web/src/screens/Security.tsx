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
import { useI18n } from '../lib/i18n';

const STATUS = ['mfa-status'] as const;

/** Le secret en base32 se lit mieux par groupes de 4. */
const grouped = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

/** Codes de secours : visibles une seule fois, à garder ailleurs que sur le téléphone. */
function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<boolean | null>(null);
  const [saved, setSaved] = useState(false);
  return (
    <section className="panel" aria-labelledby="recovery-title">
      <h2 id="recovery-title" className="section-title">
        {t('sec.recovery.title')}
      </h2>
      <p className="notice notice-bad">{t('sec.recovery.warn')}</p>
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
        {t('sec.recovery.copy')}
      </button>
      {copied === true && <p className="notice notice-ok">{t('sec.recovery.copied')}</p>}
      {copied === false && <p className="notice notice-bad">{t('sec.recovery.refused')}</p>}
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        {t('sec.recovery.saved')}
      </label>
      <button type="button" className="key key-wide" disabled={!saved} onClick={onDone}>
        {t('sec.recovery.done')}
      </button>
    </section>
  );
}

/** Activation : scanner le QR code, donner un premier code, recevoir les codes de secours. */
function Enable({ onEnabled }: { onEnabled: (codes: string[]) => void }) {
  const { refresh } = useAuth();
  const { t } = useI18n();
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
        <h2 className="section-title">{t('sec.enable.title')}</h2>
        <p>{t('sec.enable.intro')}</p>
        <ErrorNote error={setup.error} />
        <button
          type="button"
          className="key key-wide"
          disabled={setup.isPending}
          onClick={() => setup.mutate()}
        >
          {t('sec.enable.start')}
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
      <h2 className="section-title">{t('sec.enable.step1')}</h2>
      <p className="hint">{t('sec.enable.step1Hint')}</p>
      <QrCode value={setup.data.otpauthUrl} label={t('sec.enable.qrLabel')} />
      <details>
        <summary>{t('sec.enable.noScan')}</summary>
        <p className="hint">{t('sec.enable.manualKey')}</p>
        <code className="tabular" style={{ overflowWrap: 'anywhere' }}>
          {grouped(setup.data.secret)}
        </code>
      </details>
      <h2 className="section-title">{t('sec.enable.step2')}</h2>
      <div className="field">
        <label htmlFor="enable-code">{t('sec.code6')}</label>
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
        {t('sec.enable.submit')}
      </button>
    </form>
  );
}

/** Déjà active : état, nouveaux codes de secours, et désactivation pour les comptes ordinaires. */
function Active({ status, onCodes }: { status: MfaStatus; onCodes: (codes: string[]) => void }) {
  const { refresh } = useAuth();
  const { t, tn } = useI18n();
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
      <h2 className="section-title">{t('sec.active.title')}</h2>
      <p>
        <span className="tag tag-ok">{t('sec.active.on')}</span>{' '}
        <span className="muted">{tn('sec.active.left', status.recoveryCodesLeft)}</span>
      </p>
      {status.recoveryCodesLeft <= 3 && <p className="notice notice-bad">{t('sec.active.low')}</p>}
      <div className="field">
        <label htmlFor="mfa-code">{t('sec.code6')}</label>
        <input
          id="mfa-code"
          className="input tabular"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
        />
        <p className="hint">{t('sec.active.codeHint')}</p>
      </div>
      <ErrorNote error={regenerate.error ?? disable.error} />
      <button
        type="button"
        className="btn btn-accent"
        disabled={regenerate.isPending || code.trim().length < 6}
        onClick={() => regenerate.mutate()}
      >
        {t('sec.active.regenerate')}
      </button>
      {status.required ? (
        <p className="hint">{t('sec.active.required')}</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="mfa-password">{t('sec.active.passwordLabel')}</label>
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
            confirmLabel={t('sec.active.disable')}
            disabled={disable.isPending || code.trim().length < 6 || password === ''}
            onConfirm={() => disable.mutate()}
          >
            {t('sec.active.disableButton')}
          </ConfirmButton>
        </>
      )}
    </section>
  );
}

/** Écran Sécurité : activer, gérer la double authentification (obligatoire pour le propriétaire). */
export function Security() {
  const { user } = useAuth();
  const { t } = useI18n();
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
          <Link className="icon-btn flat" to="/moi" aria-label={t('common.back')}>
            <Icon name="back" size={24} />
          </Link>
        )}
        <h1 className="title">{t('sec.title')}</h1>
      </header>
      <div className="page page-wide panels-grid">
        {mustEnable && (
          <p className="notice notice-bad desk-full" role="status">
            {t('sec.mustEnable')}
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
