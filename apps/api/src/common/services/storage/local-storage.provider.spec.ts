import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { LocalStorageProvider } from './local-storage.provider';

describe('LocalStorageProvider — path traversal guard', () => {
  let provider: LocalStorageProvider;
  let root: string;

  beforeEach(async () => {
    root = join(tmpdir(), `inspexi-storage-test-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(root, { recursive: true });
    const config = {
      get: (key: string, def?: string) => (key === 'UPLOAD_DIR' ? root : def),
    } as unknown as ConfigService;
    provider = new LocalStorageProvider(config);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('stores and reads a legitimate key inside the root', async () => {
    const key = 'org-1/abc-report.pdf';
    await provider.upload(key, Buffer.from('hello'), 'application/pdf');
    expect((await provider.download(key)).toString()).toBe('hello');
    expect(await provider.exists(key)).toBe(true);
  });

  it.each([
    '../escape.txt',
    '../../etc/passwd',
    'org-1/../../secret.txt',
    'org-1/../../../etc/hosts',
  ])('rejects traversal key %p on upload', async (key) => {
    await expect(
      provider.upload(key, Buffer.from('x'), 'text/plain'),
    ).rejects.toThrow('Ongeldige storage-key');
  });

  it('rejects traversal keys on download/delete/exists', async () => {
    const key = '../../etc/passwd';
    await expect(provider.download(key)).rejects.toThrow('Ongeldige storage-key');
    await expect(provider.delete(key)).rejects.toThrow('Ongeldige storage-key');
    await expect(provider.exists(key)).rejects.toThrow('Ongeldige storage-key');
  });

  it('does not write outside the root when a traversal is attempted', async () => {
    const outside = join(root, '..', 'inspexi-leak.txt');
    await fs
      .unlink(outside)
      .catch(() => undefined); // ensure clean slate
    await expect(
      provider.upload('../inspexi-leak.txt', Buffer.from('leak'), 'text/plain'),
    ).rejects.toThrow('Ongeldige storage-key');
    await expect(fs.access(outside)).rejects.toBeDefined();
  });
});
