import { getAccessToken } from './api-client';

const BASE_URL = '/api/v1';

export async function downloadFile(
  documentId: string,
  fileName: string,
): Promise<void> {
  const token = getAccessToken();

  const response = await fetch(
    `${BASE_URL}/documents/${documentId}/download`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    },
  );

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
