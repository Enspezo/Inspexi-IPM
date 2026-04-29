import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join, dirname } from 'path';
import * as fs from 'fs/promises';
import type { StorageProvider } from './storage.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly basePath: string;

  constructor(private config: ConfigService) {
    this.basePath = this.config.get<string>('UPLOAD_DIR', './uploads');
  }

  async upload(key: string, buffer: Buffer, _mimeType: string): Promise<void> {
    const fullPath = join(this.basePath, key);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
  }

  async download(key: string): Promise<Buffer> {
    const fullPath = join(this.basePath, key);
    return fs.readFile(fullPath);
  }

  async delete(key: string): Promise<void> {
    const fullPath = join(this.basePath, key);
    await fs.unlink(fullPath).catch(() => {
      // Ignore if file not found
    });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(join(this.basePath, key));
      return true;
    } catch {
      return false;
    }
  }
}
