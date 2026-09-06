import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ConnectivityStatus } from '@fratelanza/types';
import { useAppStore } from '../stores';
import { createApiClient, resolveApiBaseUrl } from '../lib/api';
import { useAuthStore } from '../stores';

export function SyncStatusBadge() {
  const { t } = useTranslation();
  const connectivity = useAppStore((s) => s.connectivity);
  const setConnectivity = useAppStore((s) => s.setConnectivity);
  const apiUrl = useAppStore((s) => s.apiUrl);
  const deviceId = useAppStore((s) => s.deviceId);
  const setDeviceId = useAppStore((s) => s.setDeviceId);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [localProducts, setLocalProducts] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncNote, setSyncNote] = useState('');

  async function refreshLocalStats() {
    if (window.desktopApi) {
      const stats = await window.desktopApi.getLocalStats();
      if (stats.ready) {
        setLocalProducts(stats.productCount);
        setPendingCount(stats.pendingCount);
      }
    }
  }

  useEffect(() => {
    void refreshLocalStats();
  }, []);

  const labels: Record<string, string> = {
    [ConnectivityStatus.ONLINE]: t('sync.online'),
    [ConnectivityStatus.OFFLINE]: t('sync.offline'),
    [ConnectivityStatus.SYNCING]: t('sync.syncing'),
    [ConnectivityStatus.SYNC_ERROR]: t('sync.syncError'),
  };

  async function resolveDeviceId(): Promise<string | null> {
    if (deviceId) return deviceId;
    if (window.desktopApi) {
      const info = await window.desktopApi.getDeviceInfo();
      setDeviceId(info.deviceId);
      return info.deviceId;
    }
    return null;
  }

  async function handleSync() {
    if (connectivity === ConnectivityStatus.OFFLINE) return;
    setConnectivity(ConnectivityStatus.SYNCING);
    setSyncNote('');
    try {
      if (window.desktopApi) {
        const result = await window.desktopApi.runSync();
        if (!result.success) throw new Error(result.message ?? 'Sync failed');
        const processed = result.data?.processedCount ?? 0;
        const pending = result.data?.pendingCount ?? 0;
        const localCount = result.data?.localProductCount ?? 0;
        setLocalProducts(localCount);
        setPendingCount(pending);
        setSyncNote(t('sync.applied', { count: processed, local: localCount }));
      } else {
        const id = await resolveDeviceId();
        if (!id) throw new Error('Device ID unavailable');
        const client = createApiClient(() => resolveApiBaseUrl(apiUrl), () => accessToken);
        await client.triggerSync(id);
        await client.pullSync(id);
      }
      setConnectivity(ConnectivityStatus.ONLINE);
      await refreshLocalStats();
    } catch {
      setConnectivity(ConnectivityStatus.SYNC_ERROR);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span className={`sync-badge ${connectivity}`}>
        <span className="sync-dot" />
        {labels[connectivity] ?? connectivity}
      </span>
      {localProducts !== null && (
        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
          {t('sync.localProducts', { count: localProducts })}
        </span>
      )}
      {pendingCount > 0 && (
        <span style={{ fontSize: '0.8rem', color: 'var(--color-warning, #b45309)' }}>
          {t('sync.pendingChanges', { count: pendingCount })}
        </span>
      )}
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: '4px 10px', fontSize: '0.8rem' }}
        onClick={() => void handleSync()}
        disabled={connectivity === ConnectivityStatus.OFFLINE || connectivity === ConnectivityStatus.SYNCING}
      >
        {t('sync.syncNow')}
      </button>
      {syncNote && (
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{syncNote}</span>
      )}
    </div>
  );
}
