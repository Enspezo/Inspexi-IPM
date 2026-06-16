import { getAccessToken } from './api-client';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

/**
 * Authenticated download van een klant-document-PDF (org + ClientAccess gescoped door de backend).
 * fetch met Bearer-token → blob → tijdelijke <a download> → revoke.
 */
export async function downloadClientDocument(documentId: string, fileName: string): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`${BASE_URL}/client/documents/${documentId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
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
