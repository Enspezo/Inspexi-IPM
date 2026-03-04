import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Convert a DOCX buffer to PDF by calling the convert-api microservice.
   * The convert-api handles LibreOffice conversion on a separate process/machine.
   */
  async convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
    const convertApiUrl = this.config.get<string>(
      'CONVERT_API_URL',
      'http://localhost:3002',
    );
    const apiKey = this.config.get<string>('CONVERT_API_KEY');

    if (!apiKey) {
      throw new InternalServerErrorException(
        'CONVERT_API_KEY is not configured',
      );
    }

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([docxBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      'document.docx',
    );

    try {
      const response = await fetch(`${convertApiUrl}/convert/docx-to-pdf`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey },
        body: formData,
        signal: AbortSignal.timeout(65000), // slightly longer than convert API timeout
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        this.logger.error(
          `Convert API returned ${response.status}: ${errorText}`,
        );
        throw new InternalServerErrorException(
          'PDF conversie mislukt via convert service',
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;

      this.logger.error('Failed to reach convert API', error);
      throw new InternalServerErrorException(
        'PDF conversie mislukt. Convert service niet bereikbaar.',
      );
    }
  }

  /**
   * Stamp a client signature onto an existing PDF.
   * Adds the signature image and signing metadata to the last page.
   */
  async stampSignature(
    pdfBuffer: Buffer,
    signatureBase64: string,
    clientName: string,
    signedAt: Date,
    clientIp?: string,
  ): Promise<Buffer> {
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Draw a separator line
    const sigAreaY = 120;
    lastPage.drawLine({
      start: { x: 50, y: sigAreaY },
      end: { x: width - 50, y: sigAreaY },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });

    // Embed and draw signature image
    if (signatureBase64) {
      try {
        const base64Data = signatureBase64.replace(
          /^data:image\/\w+;base64,/,
          '',
        );
        const sigBytes = Buffer.from(base64Data, 'base64');

        let sigImage;
        if (
          signatureBase64.includes('image/png') ||
          !signatureBase64.includes('image/jpeg')
        ) {
          sigImage = await pdfDoc.embedPng(sigBytes);
        } else {
          sigImage = await pdfDoc.embedJpg(sigBytes);
        }

        // Scale signature to fit
        const maxWidth = 200;
        const maxHeight = 60;
        const scale = Math.min(
          maxWidth / sigImage.width,
          maxHeight / sigImage.height,
          1,
        );
        const drawWidth = sigImage.width * scale;
        const drawHeight = sigImage.height * scale;

        lastPage.drawImage(sigImage, {
          x: 50,
          y: sigAreaY - drawHeight - 10,
          width: drawWidth,
          height: drawHeight,
        });
      } catch (err) {
        this.logger.warn('Failed to embed signature image in PDF', err);
      }
    }

    // Add signing metadata text
    const dateStr = signedAt.toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const textY = 30;
    lastPage.drawText(`Digitaal ondertekend door ${clientName}`, {
      x: 50,
      y: textY + 14,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });

    lastPage.drawText(`Datum: ${dateStr}`, {
      x: 50,
      y: textY,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });

    if (clientIp) {
      lastPage.drawText(`IP: ${clientIp}`, {
        x: width - 150,
        y: textY,
        size: 7,
        font,
        color: rgb(0.6, 0.6, 0.6),
      });
    }

    return Buffer.from(await pdfDoc.save());
  }
}
