import { getAccessToken } from './api-client';

const BASE_URL = '/api/v1';

/**
 * Authenticated blob-download van een willekeurig API-pad: voegt de Bearer-token
 * toe, haalt de blob op en triggert een tijdelijke download-link.
 */
export async function downloadFromPath(
  path: string,
  fileName: string,
): Promise<void> {
  const token = getAccessToken();

  const response = await fetch(`${BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
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
