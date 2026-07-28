import { downloadFromPath as coreDownloadFromPath } from '@inspexi/shared-web';
import { getAccessToken } from './api-client';

// Staf-portal-download-helpers: authenticated blob-download via de gedeelde
// @inspexi/shared-web-kern, met de portal-defaults (base-URL `/api/v1` +
// `credentials: 'include'`).

const BASE_URL = '/api/v1';

/**
 * Authenticated blob-download van een willekeurig API-pad: voegt de Bearer-token
 * toe, haalt de blob op en triggert een tijdelijke download-link.
 */
export function downloadFromPath(path: string, fileName: string): Promise<void> {
  return coreDownloadFromPath(path, fileName, {
    baseUrl: BASE_URL,
    getToken: getAccessToken,
    credentials: 'include',
  });
}

/** Document uit het DMS (/documents) downloaden. */
export function downloadFile(documentId: string, fileName: string): Promise<void> {
  return downloadFromPath(`/documents/${documentId}/download`, fileName);
}

/** Privé certificaatbestand van een inspecteur downloaden (PRD-11). */
export function downloadCertificateDocument(
  certId: string,
  fileName: string,
): Promise<void> {
  return downloadFromPath(`/inspector-certificates/${certId}/document`, fileName);
}

/** Kalibratiecertificaat van een meetmiddel downloaden. */
export function downloadCalibrationDocument(
  instrumentId: string,
  calibrationId: string,
  fileName: string,
): Promise<void> {
  return downloadFromPath(
    `/measurement-instruments/${instrumentId}/calibrations/${calibrationId}/document`,
    fileName,
  );
}
