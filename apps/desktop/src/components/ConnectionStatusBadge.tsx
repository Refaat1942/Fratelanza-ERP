import { useTranslation } from 'react-i18next';
import { ConnectivityStatus } from '@fratelanza/types';
import { useAppStore } from '../stores';

export function ConnectionStatusBadge() {
  const { t } = useTranslation();
  const connectivity = useAppStore((s) => s.connectivity);
  const apiUrl = useAppStore((s) => s.apiUrl);

  const labels: Record<string, string> = {
    [ConnectivityStatus.ONLINE]: t('sync.online'),
    [ConnectivityStatus.OFFLINE]: t('sync.offline'),
    [ConnectivityStatus.SYNCING]: t('sync.syncing'),
    [ConnectivityStatus.SYNC_ERROR]: t('sync.syncError'),
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className={`sync-badge ${connectivity}`}>
        <span className="sync-dot" />
        {labels[connectivity] ?? connectivity}
      </span>
      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
        {apiUrl || t('connection.serverNotConfigured')}
      </span>
    </div>
  );
}
