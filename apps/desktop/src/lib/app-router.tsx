import { type ComponentType, type ReactNode } from 'react';
import { BrowserRouter, HashRouter } from 'react-router-dom';

/**
 * Browser history routing only works with http(s) dev server URLs.
 * Packaged Electron loads the renderer via file:// — HashRouter avoids
 * navigation to file:///C:/ on Windows.
 */
export const AppRouter: ComponentType<{ children: ReactNode }> = import.meta.env.PROD
  ? HashRouter
  : BrowserRouter;
