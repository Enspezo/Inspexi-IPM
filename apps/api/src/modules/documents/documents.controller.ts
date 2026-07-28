import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  HttpStatus,
  FileValidator,
  UnprocessableEntityException,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { User } from '@prisma/client';
import { ALL_STAFF, CRM_ROLES, ORG_ADMINS } from '@/common/auth/roles';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  setBinaryResponseHeaders,
  sanitizeDispositionFilename,
} from '@/common';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto, ListDocumentsQueryDto, UpdateDocumentDto } from './dto';
import { Roles, CurrentUser } from '@/common/decorators';
import { ParseUuidPipe } from '@/common';

/**
 * Custom file type validator that checks the MIME type supplied by the client.
 * NestJS built-in FileTypeValidator uses `file-type` which inspects magic bytes.
 * Formats like CSV, SVG, and plain-text docs have no magic bytes, so they
 * are rejected by the built-in validator.  This validator accepts them based
 * on the mimetype field set by multer; de claim↔inhoud-kruiscontrole (magic
 * bytes waar het formaat die heeft) volgt daarna in de service (WP-B4).
 */
class MimeTypeValidator extends FileValidator {
  constructor() {
    super({});
  }

  isValid(file?: Express.Multer.File): boolean {
    if (!file) return false;
    return (ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.mimetype);
  }

  buildErrorMessage(): string {
    return `Bestandstype niet toegestaan. Toegestane types: PDF, afbeeldingen (JPEG, PNG, SVG, WebP), Word, Excel, PowerPoint, CSV, ZIP.`;
  }
}

@ApiTags('Documents')
@ApiBearerAuth()
@RequiresFeature('WORKFLOW_COMPLEET')
@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Post()
  @Roles(...CRM_ROLES)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Document uploaden' })
  @ApiResponse({ status: 201, description: 'Document geüpload' })
  async upload(
    @UploadedFile(
      new ParseFilePipe({
        errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        validators: [
          new MaxFileSizeValidator({ maxSize: 25 * 1024 * 1024 }),
          new MimeTypeValidator(),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @CurrentUser() user: User,
  ) {
    const document = await this.documentsService.upload(file, dto, user);
    return { success: true, data: document };
  }

  @Get('storage-stats')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Opslag statistieken ophalen voor organisatie' })
  @ApiResponse({ status: 200, description: 'Opslag quota en gebruik' })
  async storageStats(@CurrentUser() user: User) {
    const stats = await this.documentsService.getStorageStats(user.orgId!);
    return { success: true, data: stats };
  }

  @Get()
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Documenten ophalen' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst documenten' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListDocumentsQueryDto,
  ) {
    const result = await this.documentsService.findAll(user, query);
    return { success: true, data: result };
  }

  @Get(':id')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Document metadata ophalen' })
  @ApiResponse({ status: 200, description: 'Document details' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const document = await this.documentsService.findOne(id, user);
    return { success: true, data: document };
  }

  @Get(':id/download')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Document downloaden' })
  @ApiResponse({ status: 200, description: 'Bestand gedownload' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async download(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const { buffer, document } = await this.documentsService.download(id, user);
    // Altijd attachment (documenten renderen nooit op het app-origin);
    // nosniff + sandbox-CSP via de gedeelde helper (WP-B4).
    setBinaryResponseHeaders(res, {
      mimeType: document.mimeType,
      contentLength: buffer.length,
      filename: sanitizeDispositionFilename(document.originalName),
      disposition: 'attachment',
      cacheControl: 'private, no-store',
    });
    res.send(buffer);
  }

  @Patch(':id')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Document beschrijving bijwerken' })
  @ApiResponse({ status: 200, description: 'Document bijgewerkt' })
  async update(
    @Param('id', ParseUuidPipe) id: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: User,
  ) {
    const document = await this.documentsService.update(id, dto, user);
    return { success: true, data: document };
  }

  @Delete(':id')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Document verwijderen' })
  @ApiResponse({ status: 200, description: 'Document verwijderd' })
  async remove(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.documentsService.remove(id, user);
    return { success: true, message: 'Document verwijderd' };
  }
}
