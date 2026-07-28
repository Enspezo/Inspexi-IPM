import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageObjectNotFoundError, type StorageProvider } from './storage.interface';

/** Optionele capability bovenop StorageProvider; door services feature-gedetecteerd. */
export interface SignedUrlCapableStorage extends StorageProvider {
  supportsSignedUrls(): true;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  getPublicUrl(key: string): string;
}

@Injectable()
export class R2StorageProvider implements SignedUrlCapableStorage {
  private readonly logger = new Logger(R2StorageProvider.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(private config: ConfigService) {
    const accountId = this.config.getOrThrow<string>('R2_ACCOUNT_ID');
    this.bucket = this.config.getOrThrow<string>('R2_BUCKET_NAME');
    this.publicBaseUrl = this.config.get<string>('R2_PUBLIC_URL', '').replace(/\/$/, '');

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  supportsSignedUrls(): true {
    return true;
  }

  async upload(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
  }

  async download(key: string): Promise<Buffer> {
    let res;
    try {
      res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      // B-154: NoSuchKey/404 van R2 → zelfde getypeerde fout als de lokale
      // provider, zodat de centrale 404-mapping provideronafhankelijk is.
      const name = (err as { name?: string })?.name;
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata
        ?.httpStatusCode;
      if (name === 'NoSuchKey' || status === 404) {
        throw new StorageObjectNotFoundError(key);
      }
      throw err;
    }
    const body = res.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  /** Tijdelijke, gesigneerde GET-URL (default 1 uur). Voor client-portal downloads / foto-preview. */
  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  /** Publieke URL (alleen zinvol als de bucket/publieke-domein read-public is). */
  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }
}
