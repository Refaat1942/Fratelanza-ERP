import { type ComponentType, type ReactNode } from 'react';
import { BrowserRouter, HashRouter } from 'react-router-dom';

/**
 * Browser history for web SaaS; HashRouter for packaged Electron (file://).
 */
export const AppRouter: ComponentType<{ children: ReactNode }> =
  import.meta.env.VITE_WEB_APP === 'true' || import.meta.env.DEV
    ? BrowserRouter
    : HashRouter;
