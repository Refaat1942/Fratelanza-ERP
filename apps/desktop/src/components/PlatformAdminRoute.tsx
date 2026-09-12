import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores';

export function PlatformAdminRoute({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user?.isPlatformAdmin) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
