/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override voor de PDOK luchtfoto-WMS base-URL (best-effort luchtfoto). */
  readonly VITE_PDOK_LUCHTFOTO_WMS_URL?: string;
  /**
   * Optionele expliciete basisdomein-override (bv. `staging.example.com`). Gezet → strikte
   * tenant-resolutie: `<slug>.<VITE_BASE_DOMAIN>` (superuser-subdomein blijft `mijn`).
   * Leeg → heuristiek (localhost / *.localhost / *.inspexi.nl).
   */
  readonly VITE_BASE_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
