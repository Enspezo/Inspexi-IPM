/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override voor de PDOK luchtfoto-WMS base-URL (best-effort luchtfoto). */
  readonly VITE_PDOK_LUCHTFOTO_WMS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
