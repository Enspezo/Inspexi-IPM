import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ConvertService {
  private readonly logger = new Logger(ConvertService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Convert a DOCX buffer to PDF using LibreOffice headless.
   * Includes configurable timeout protection.
   */
  async convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const libre = require('libreoffice-convert');
    const { promisify } = await import('util');
    const convertAsync = promisify(libre.convert);

    const timeoutMs = this.config.get<number>('CONVERT_TIMEOUT_MS', 60000);

    try {
      const pdfBuffer = await Promise.race([
        convertAsync(docxBuffer, '.pdf', undefined),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('LibreOffice conversion timed out')),
            timeoutMs,
          ),
        ),
      ]);

      this.logger.log(
        `Converted DOCX (${(docxBuffer.length / 1024).toFixed(1)} KB) → PDF (${((pdfBuffer as Buffer).length / 1024).toFixed(1)} KB)`,
      );

      return pdfBuffer as Buffer;
    } catch (error: any) {
      this.logger.error('DOCX to PDF conversion failed', error);

      if (error.message?.includes('timed out')) {
        throw new InternalServerErrorException(
          `Conversie timeout na ${timeoutMs / 1000} seconden`,
        );
      }

      throw new InternalServerErrorException(
        'PDF conversie mislukt. Controleer of LibreOffice is geïnstalleerd.',
      );
    }
  }
}
