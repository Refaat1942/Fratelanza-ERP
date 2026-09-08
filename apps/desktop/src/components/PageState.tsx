import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function PageState({
  variant,
  title,
  message,
  action,
}: {
  variant: 'loading' | 'empty' | 'error' | 'unlicensed';
  title?: string;
  message?: string;
  action?: ReactNode;
}) {
  const { t } = useTranslation();

  const defaultTitle =
    variant === 'loading'
      ? t('common.loading')
      : variant === 'empty'
        ? t('common.noData')
        : variant === 'unlicensed'
          ? t('license.moduleNotLicensed')
          : t('errors.loadFailed');

  return (
    <div className={`page-state page-state--${variant}`}>
      <div className="page-state-icon" aria-hidden>
        {variant === 'loading' && <span className="page-state-spinner" />}
        {variant === 'empty' && '∅'}
        {variant === 'error' && '!'}
        {variant === 'unlicensed' && 'L'}
      </div>
      <h3 className="page-state-title">{title ?? defaultTitle}</h3>
      {message && <p className="page-state-message">{message}</p>}
      {action}
    </div>
  );
}
