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
import { User } from '@prisma/client';
import { ALL_STAFF } from '@/common/auth/roles';
import { Roles, CurrentUser } from '@/common/decorators';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import {
  resolveUploadedContentType,
  setBinaryResponseHeaders,
  sanitizeDispositionFilename,
} from '@/common';
import { InspectorCertificatesService } from './inspector-certificates.service';
import {
  CreateInspectorCertificateDto,
  UpdateInspectorCertificateDto,
  ListInspectorCertificatesQueryDto,
  CertificateSuggestionsQueryDto,
} from './dto';
import { ParseUuidPipe } from '@/common';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

/**
 * Mime-validator beperkt tot de bestandstypen die voor een diploma/certificaat
 * zinvol zijn: PDF + rasterafbeeldingen (scans/foto's). Eerste poort op de
 * client-claim; de inhoud (magic bytes) wordt in de service gevalideerd
 * (WP-B4). SVG is geen scan/foto en niet meer toegestaan.
 */
const ALLOWED_MIME_REGEX = /^(application\/pdf|image\/(jpeg|png|webp))$/;

class CertificateMimeTypeValidator extends FileValidator {
  constructor() {
    super({});
  }

  isValid(file?: Express.Multer.File): boolean {
    if (!file) return false;
    return ALLOWED_MIME_REGEX.test(file.mimetype);
  }

  buildErrorMessage(): string {
    return 'Bestandstype niet toegestaan. Toegestane types: PDF, JPEG, PNG, WebP.';
  }
}

/** Optioneel bestand: leeg veld is toegestaan, een aangeleverd bestand wordt gevalideerd. */
const optionalFilePipe = new ParseFilePipe({
  errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  fileIsRequired: false,
  validators: [
    new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
    new CertificateMimeTypeValidator(),
  ],
});

const fileInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

@ApiTags('Inspector certificates')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Roles(...ALL_STAFF)
@Controller('inspector-certificates')
export class InspectorCertificatesController {
  constructor(private readonly service: InspectorCertificatesService) {}

  // ─── Specifieke routes (vóór :id) ───────────────────────

  @Get('suggestions')
  @ApiOperation({ summary: 'Autocomplete-suggesties voor Soort/Instantie' })
  @ApiResponse({ status: 200, description: 'Distinct waarden binnen de organisatie' })
  async suggestions(
    @CurrentUser() user: User,
    @Query() query: CertificateSuggestionsQueryDto,
  ) {
    const data = await this.service.getSuggestions(user, query.field, query.q);
    return { success: true, data };
  }

  @Get()
  @ApiOperation({ summary: 'Certificaten ophalen (eigen, of per inspecteur)' })
  @ApiResponse({ status: 200, description: 'Gepagineerde lijst certificaten' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: ListInspectorCertificatesQueryDto,
  ) {
    const data = await this.service.findAll(user, query);
    return { success: true, data };
  }

  @Get(':id/document')
  @ApiOperation({ summary: 'Certificaatbestand downloaden' })
  @ApiResponse({ status: 200, description: 'Bestand gedownload' })
  @ApiResponse({ status: 404, description: 'Geen document gekoppeld' })
  async downloadDocument(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const { buffer, certificate } = await this.service.getDocument(id, user);
    // WP-B4: het geserveerde Content-Type komt uit de bytes; legacy rijen met
    // gespoofte of SVG-inhoud degraderen naar octet-stream.
    setBinaryResponseHeaders(res, {
      mimeType: resolveUploadedContentType(buffer).mimeType,
      contentLength: buffer.length,
      filename: sanitizeDispositionFilename(certificate.originalName, 'certificaat'),
      disposition: 'attachment',
      cacheControl: 'private, no-store',
    });
    res.send(buffer);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Certificaat-metadata ophalen' })
  @ApiResponse({ status: 200, description: 'Certificaat details' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.findOne(id, user);
    return { success: true, data };
  }

  // ─── Schrijf-routes ─────────────────────────────────────

  @Post()
  @UseInterceptors(fileInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Certificaat toevoegen (optioneel met document)' })
  @ApiResponse({ status: 201, description: 'Certificaat aangemaakt' })
  async create(
    @UploadedFile(optionalFilePipe) file: Express.Multer.File | undefined,
    @Body() dto: CreateInspectorCertificateDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.create(file, dto, user);
    return { success: true, data };
  }

  @Patch(':id')
  @UseInterceptors(fileInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Certificaat bijwerken (optioneel bestand vervangen)' })
  @ApiResponse({ status: 200, description: 'Certificaat bijgewerkt' })
  async update(
    @Param('id', ParseUuidPipe) id: string,
    @UploadedFile(optionalFilePipe) file: Express.Multer.File | undefined,
    @Body() dto: UpdateInspectorCertificateDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.update(id, file, dto, user);
    return { success: true, data };
  }

  @Delete(':id/document')
  @ApiOperation({ summary: 'Alleen het gekoppelde document verwijderen' })
  @ApiResponse({ status: 200, description: 'Document verwijderd' })
  async removeDocument(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.removeDocument(id, user);
    return { success: true, data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Certificaat verwijderen' })
  @ApiResponse({ status: 200, description: 'Certificaat verwijderd' })
  async remove(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.service.remove(id, user);
    return { success: true, message: 'Certificaat verwijderd' };
  }
}
