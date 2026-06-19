/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optionele override voor de API-basis-URL. Laat LEEG in dev/prod als de client-portal op
   * een org-subdomein draait met een /api-proxy: dan moet de Host-header (het subdomein) behouden
   * blijven voor de tenant-resolutie, dus gebruiken we de relatieve '/api/v1'. Een absolute
   * cross-domein-URL zou de subdomein-tenancy breken.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
