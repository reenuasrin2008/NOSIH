/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NOSIH_API_URL?: string;
  readonly VITE_NOSIH_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
