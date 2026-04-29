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
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  HttpStatus,
  FileValidator,
  UnprocessableEntityException,
} from '@nestjs/common';
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
import { User, Role } from '@prisma/client';
import { DocumentsService } from './documents.service';
import { UploadDocumentDto, ListDocumentsQueryDto, UpdateDocumentDto } from './dto';
import { Roles, CurrentUser } from '@/common/decorators';

/**
 * Custom file type validator that checks the MIME type supplied by the client.
 * NestJS built-in FileTypeValidator uses `file-type` which inspects magic bytes.
 * Formats like CSV, SVG, and plain-text docs have no magic bytes, so they
 * are rejected by the built-in validator.  This validator accepts them based
 * on the mimetype field set by multer.
 */
const ALLOWED_MIME_REGEX =
  /^(application\/pdf|image\/(jpeg|png|svg\+xml|webp)|application\/vnd\.(ms-excel|ms-powerpoint|openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document|presentationml\.presentation))|application\/msword|application\/zip|text\/csv)$/;

class MimeTypeValidator extends FileValidator {
  constructor() {
    super({});
  }

  isValid(file?: Express.Multer.File): boolean {
    if (!file) return false;
    return ALLOWED_MIME_REGEX.test(file.mimetype);
  }

  buildErrorMessage(): string {
    return `Bestandstype niet toegestaan. Toegestane types: PDF, afbeeldingen (JPEG, PNG, SVG, WebP), Word, Excel, PowerPoint, CSV, ZIP.`;
  }
}

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private documentsService: DocumentsService) {}

  @Post()
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Opslag statistieken ophalen voor organisatie' })
  @ApiResponse({ status: 200, description: 'Opslag quota en gebruik' })
  async storageStats(@CurrentUser() user: User) {
    const stats = await this.documentsService.getStorageStats(user.orgId!);
    return { success: true, data: stats };
  }

  @Get()
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
    Role.INSPECTEUR,
  )
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
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
    Role.INSPECTEUR,
  )
  @ApiOperation({ summary: 'Document metadata ophalen' })
  @ApiResponse({ status: 200, description: 'Document details' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const document = await this.documentsService.findOne(id, user);
    return { success: true, data: document };
  }

  @Get(':id/download')
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
    Role.INSPECTEUR,
  )
  @ApiOperation({ summary: 'Document downloaden' })
  @ApiResponse({ status: 200, description: 'Bestand gedownload' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const { buffer, document } = await this.documentsService.download(id, user);
    res.set({
      'Content-Type': document.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(document.originalName)}"`,
      'Content-Length': buffer.length.toString(),
    });
    res.send(buffer);
  }

  @Patch(':id')
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Document beschrijving bijwerken' })
  @ApiResponse({ status: 200, description: 'Document bijgewerkt' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: User,
  ) {
    const document = await this.documentsService.update(id, dto, user);
    return { success: true, data: document };
  }

  @Delete(':id')
  @Roles(
    Role.SUPERUSER,
    Role.ORG_ADMIN,
    Role.MANAGER,
    Role.BACKOFFICE,
    Role.WERKVOORBEREIDER,
  )
  @ApiOperation({ summary: 'Document verwijderen' })
  @ApiResponse({ status: 200, description: 'Document verwijderd' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.documentsService.remove(id, user);
    return { success: true, message: 'Document verwijderd' };
  }
}
