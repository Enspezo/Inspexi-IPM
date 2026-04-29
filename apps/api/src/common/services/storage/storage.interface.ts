export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';

export interface StorageProvider {
  upload(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
