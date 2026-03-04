import {
  Controller,
  Post,
  Get,
  HttpCode,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ConvertService } from './convert.service';
import { ApiKeyGuard } from './guards/api-key.guard';

@Controller('convert')
export class ConvertController {
  constructor(private readonly convertService: ConvertService) {}

  /**
   * Health check — no authentication required.
   * Used by Docker healthchecks and load balancers.
   */
  @Get('health')
  healthCheck() {
    return { status: 'ok', service: 'convert-api' };
  }

  /**
   * Convert a DOCX file to PDF.
   * Accepts multipart form-data with a `file` field.
   * Returns the PDF buffer with Content-Type: application/pdf.
   */
  @Post('docx-to-pdf')
  @HttpCode(200)
  @UseGuards(ApiKeyGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    }),
  )
  async docxToPdf(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
  ) {
    if (!file) {
      throw new BadRequestException(
        'No file uploaded. Send a DOCX file as the "file" field.',
      );
    }

    const pdfBuffer = await this.convertService.convertDocxToPdf(file.buffer);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdfBuffer.length),
    });
    res.send(pdfBuffer);
  }
}
