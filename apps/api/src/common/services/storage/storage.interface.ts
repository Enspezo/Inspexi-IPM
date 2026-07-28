export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface StorageProvider {
  /**
   * @throws {StorageObjectNotFoundError} als het object niet (meer) bestaat —
   *   de global exception filter mapt die centraal naar een NL 404 (B-154).
   */
  download(key: string): Promise<Buffer>;
  upload(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/**
 * B-154: getypeerde fout voor "object bestaat niet in de storage". Providers
 * gooien deze vanuit `download()` zodat élke download-route (documenten,
 * offerte-PDF's, gegenereerde rapporten, herstelfoto's, avatars, logo's) in één
 * keer een nette 404 geeft in plaats van een Engelse 500 op de rauwe
 * ENOENT/NoSuchKey. De storage-key blijft beschikbaar voor de warn-log maar
 * komt nooit in de response.
 */
export class StorageObjectNotFoundError extends Error {
  constructor(readonly key: string) {
    super(`Storage object not found: ${key}`);
    this.name = 'StorageObjectNotFoundError';
  }
}
