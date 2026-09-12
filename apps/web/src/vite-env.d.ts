/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_PROXY?: string;
  readonly VITE_SAME_ORIGIN_API?: string;
  readonly VITE_WEB_APP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
