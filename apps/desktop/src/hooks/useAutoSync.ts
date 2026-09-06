import { useEffect, useRef } from 'react';
import { ConnectivityStatus } from '@fratelanza/types';
import { useAppStore, useAuthStore } from '../stores';

export function useAutoSync() {
  const connectivity = useAppStore((s) => s.connectivity);
  const setConnectivity = useAppStore((s) => s.setConnectivity);
  const accessToken = useAuthStore((s) => s.accessToken);
  const prevConnectivity = useRef(connectivity);

  useEffect(() => {
    const wasOffline =
      prevConnectivity.current === ConnectivityStatus.OFFLINE ||
      prevConnectivity.current === ConnectivityStatus.SYNC_ERROR;
    const isOnline = connectivity === ConnectivityStatus.ONLINE;

    if (wasOffline && isOnline && accessToken && window.desktopApi) {
      setConnectivity(ConnectivityStatus.SYNCING);
      void window.desktopApi
        .runSync()
        .then((result) => {
          setConnectivity(result.success ? ConnectivityStatus.ONLINE : ConnectivityStatus.SYNC_ERROR);
        })
        .catch(() => {
          setConnectivity(ConnectivityStatus.SYNC_ERROR);
        });
    }

    prevConnectivity.current = connectivity;
  }, [connectivity, accessToken, setConnectivity]);
}
