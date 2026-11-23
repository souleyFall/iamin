import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useCreateGroup } from '../api/queries';
import { useAuth } from '../auth/session';
import { ErrorNote } from '../components/ErrorNote';
import { Icon } from '../components/Icon';
import { useCurrentGroup } from '../groups/current';
import { useI18n } from '../lib/i18n';

/** Un super admin crée un groupe : il en devient le super admin et y invitera ses admins. */
export function NewGroup() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { select } = useCurrentGroup();
  const navigate = useNavigate();
  const create = useCreateGroup();
  const [name, setName] = useState('');

  if (user?.role !== 'GROUP_CREATOR') return <Navigate to="/" replace />;
  const fieldError = create.error instanceof ApiError ? create.error.fields : {};

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate(name.trim(), {
      onSuccess: ({ group }) => {
        select(group.id);
        void navigate('/groupe', { replace: true });
      },
    });
  }

  return (
    <>
      <header className="topbar">
        <Link className="icon-btn flat" to="/groupe" aria-label={t('common.back')}>
          <Icon name="back" size={24} />
        </Link>
        <h1 className="title">{t('group.newTitle')}</h1>
      </header>
      <form className="page" onSubmit={submit}>
        <div className="field">
          <label htmlFor="group-name">{t('group.name')}</label>
          <input
            id="group-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('group.namePlaceholder')}
            maxLength={60}
            required
          />
          {fieldError.name && <p className="error">{fieldError.name}</p>}
        </div>
        <ErrorNote error={Object.keys(fieldError).length === 0 ? create.error : null} />
        <button
          className="key key-wide"
          type="submit"
          disabled={create.isPending || name.trim().length < 2}
        >
          {t('group.submit')}
        </button>
        <p className="hint">{t('group.superHint')}</p>
      </form>
    </>
  );
}
