/**
 * Gedeelde authenticated blob-download: voegt de Bearer-token toe, haalt de blob
 * op en triggert een tijdelijke `<a download>`-link.
 *
 * De base-URL, token-bron en `credentials`-modus verschillen per app en worden
 * daarom als opties meegegeven (Beheer-portal: `/api/v1` + `credentials:
 * 'include'`; klantportaal: `import.meta.env.VITE_API_URL` zonder credentials).
 */

export interface DownloadOptions {
  /** Base-URL waarachter het pad hangt (default `/api/v1`). */
  baseUrl?: string;
  /** Levert het access-token voor de `Bearer`-header. */
  getToken?: () => string | null;
  /** Fetch-credentials-modus (bijv. `'include'`); weggelaten = default fetch-gedrag. */
  credentials?: RequestCredentials;
}

export async function downloadFromPath(
  path: string,
  fileName: string,
  options: DownloadOptions = {},
): Promise<void> {
  const { baseUrl = '/api/v1', getToken, credentials } = options;
  const token = getToken?.() ?? null;

  const init: RequestInit = {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  };
  if (credentials) init.credentials = credentials;

  const response = await fetch(`${baseUrl}${path}`, init);

  if (!response.ok) {
    throw new Error('Download mislukt');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
