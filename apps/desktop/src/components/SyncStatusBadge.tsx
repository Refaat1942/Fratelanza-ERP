import { useTranslation } from 'react-i18next';
import { ConnectivityStatus } from '@fratelanza/types';
import { useAppStore } from '../stores';

export function SyncStatusBadge() {
  const { t } = useTranslation();
  const connectivity = useAppStore((s) => s.connectivity);

  const labels: Record<string, string> = {
    [ConnectivityStatus.ONLINE]: t('sync.online'),
    [ConnectivityStatus.OFFLINE]: t('sync.offline'),
    [ConnectivityStatus.SYNCING]: t('sync.syncing'),
    [ConnectivityStatus.SYNC_ERROR]: t('sync.syncError'),
  };

  return (
    <span className={`sync-badge ${connectivity}`}>
      <span className="sync-dot" />
      {labels[connectivity] ?? connectivity}
    </span>
  );
}
