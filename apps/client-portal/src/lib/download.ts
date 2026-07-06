import { downloadFromPath } from '@inspexi/shared-web';
import { getAccessToken } from './api-client';

// Klantportaal-download: authenticated blob-download via de gedeelde
// @inspexi/shared-web-kern, met de klant-defaults (base-URL uit
// VITE_API_URL, geen `credentials`).

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

/**
 * Authenticated download van een klant-document-PDF (org + ClientAccess gescoped door de backend).
 * fetch met Bearer-token → blob → tijdelijke <a download> → revoke.
 */
export function downloadClientDocument(documentId: string, fileName: string): Promise<void> {
  return downloadFromPath(`/client/documents/${documentId}/download`, fileName, {
    baseUrl: BASE_URL,
    getToken: getAccessToken,
  });
}
