import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join, dirname, resolve, sep } from 'path';
import * as fs from 'fs/promises';
import { StorageObjectNotFoundError, type StorageProvider } from './storage.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly basePath: string;
  private readonly resolvedRoot: string;

  constructor(private config: ConfigService) {
    this.basePath = this.config.get<string>('UPLOAD_DIR', './uploads');
    this.resolvedRoot = resolve(this.basePath);
  }

  /**
   * Resolve a storage key to an absolute path and guarantee it stays inside the
   * upload root. Keys are partly built from user-controlled filenames, so a
   * crafted `../` sequence must never let a read/write/delete escape the root.
   */
  private safeResolve(key: string): string {
    const full = resolve(join(this.basePath, key));
    if (full !== this.resolvedRoot && !full.startsWith(this.resolvedRoot + sep)) {
      throw new Error('Ongeldige storage-key');
    }
    return full;
  }

  async upload(key: string, buffer: Buffer, _mimeType: string): Promise<void> {
    const fullPath = this.safeResolve(key);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
  }

  async download(key: string): Promise<Buffer> {
    const fullPath = this.safeResolve(key);
    try {
      return await fs.readFile(fullPath);
    } catch (err) {
      // B-154: een ontbrekend object is een verwachtbare toestand (gefaalde
      // upload, opgeruimde uploads-map, bucket-migratie) — geef een getypeerde
      // fout die de exception filter naar een NL 404 mapt i.p.v. de rauwe
      // ENOENT als 500 te laten doorslaan.
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        throw new StorageObjectNotFoundError(key);
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const fullPath = this.safeResolve(key);
    await fs.unlink(fullPath).catch(() => {
      // Ignore if file not found
    });
  }

  async exists(key: string): Promise<boolean> {
    // Resolve (and guard) outside the try so an invalid key throws rather than
    // being masked as "does not exist".
    const fullPath = this.safeResolve(key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}
