import { formatWhen } from '../lib/datetime';
import { useI18n } from '../lib/i18n';

/** La date prévue d'un tournoi, à l'heure de la personne qui lit ; ou « date non précisée ». */
export function When({ value }: { value: string | null }) {
  const { t, date } = useI18n();
  if (value === null) return <span className="muted">{t('when.none')}</span>;
  return <time dateTime={value}>{formatWhen(value, date)}</time>;
}
