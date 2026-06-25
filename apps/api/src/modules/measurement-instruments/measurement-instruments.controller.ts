import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
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
import { Role, User } from '@prisma/client';
import { ALL_STAFF } from '@/common/auth/roles';
import { Roles, CurrentUser } from '@/common/decorators';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { MeasurementInstrumentsService } from './measurement-instruments.service';
import {
  CreateMeasurementInstrumentDto,
  UpdateMeasurementInstrumentDto,
  QueryMeasurementInstrumentsDto,
  CreateCalibrationDto,
  UpdateCalibrationDto,
  InstrumentSuggestionsQueryDto,
  SetDefaultInstrumentsDto,
} from './dto';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

/** Beheer-rollen die meetmiddelen + kalibraties mogen muteren. */
const WRITE_ROLES = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.WERKVOORBEREIDER,
] as const;

/** PDF + afbeeldingen (scans/foto's). Checkt `file.mimetype` (multer), niet magic bytes. */
const ALLOWED_MIME_REGEX = /^(application\/pdf|image\/(jpeg|png|webp|svg\+xml))$/;

class CalibrationMimeTypeValidator extends FileValidator {
  constructor() {
    super({});
  }

  isValid(file?: Express.Multer.File): boolean {
    if (!file) return false;
    return ALLOWED_MIME_REGEX.test(file.mimetype);
  }

  buildErrorMessage(): string {
    return 'Bestandstype niet toegestaan. Toegestane types: PDF, JPEG, PNG, WebP, SVG.';
  }
}

/** Optioneel bestand: leeg veld toegestaan, een aangeleverd bestand wordt gevalideerd. */
const optionalFilePipe = new ParseFilePipe({
  errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
  fileIsRequired: false,
  validators: [
    new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
    new CalibrationMimeTypeValidator(),
  ],
});

const fileInterceptor = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

@ApiTags('Meetmiddelen')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Roles(...ALL_STAFF)
@Controller('measurement-instruments')
export class MeasurementInstrumentsController {
  constructor(private readonly service: MeasurementInstrumentsService) {}

  // ─── Specifieke routes (vóór :id) ───────────────────────

  @Get('suggestions')
  @ApiOperation({ summary: 'Autocomplete: merk/type (meetmiddel) of uitvoerende instantie' })
  async suggestions(
    @CurrentUser() user: User,
    @Query() query: InstrumentSuggestionsQueryDto,
  ) {
    const data = await this.service.getSuggestions(user, query.field, query.q);
    return { success: true, data };
  }

  @Get('my-defaults')
  @ApiOperation({ summary: 'Eigen standaard-meetmiddelen (niveau 1)' })
  async getMyDefaults(@CurrentUser() user: User) {
    const data = await this.service.getMyDefaults(user);
    return { success: true, data };
  }

  @Put('my-defaults')
  @ApiOperation({ summary: 'Eigen standaard-meetmiddelen instellen (volledige set)' })
  async setMyDefaults(@CurrentUser() user: User, @Body() dto: SetDefaultInstrumentsDto) {
    const data = await this.service.setMyDefaults(user, dto.instrumentIds);
    return { success: true, data };
  }

  @Get('plan-defaults/:planId')
  @ApiOperation({ summary: 'Standaard-meetmiddelen voor een inspectie (niveau 2)' })
  async getPlanDefaults(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.getPlanDefaults(planId, user);
    return { success: true, data };
  }

  @Put('plan-defaults/:planId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Standaard-meetmiddelen voor een inspectie instellen' })
  async setPlanDefaults(
    @Param('planId', ParseUUIDPipe) planId: string,
    @CurrentUser() user: User,
    @Body() dto: SetDefaultInstrumentsDto,
  ) {
    const data = await this.service.setPlanDefaults(planId, user, dto.instrumentIds);
    return { success: true, data };
  }

  @Get()
  @ApiOperation({ summary: 'Meetmiddelen ophalen (gepagineerd, met filters)' })
  async findAll(
    @CurrentUser() user: User,
    @Query() query: QueryMeasurementInstrumentsDto,
  ) {
    const data = await this.service.findAll(user, query);
    return { success: true, data };
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Meetmiddel aanmaken' })
  async create(@CurrentUser() user: User, @Body() dto: CreateMeasurementInstrumentDto) {
    const data = await this.service.create(user, dto);
    return { success: true, data };
  }

  // ─── Kalibraties (subresource; specifiek vóór :id) ──────

  @Get(':id/calibrations')
  @ApiOperation({ summary: 'Kalibraties van een meetmiddel' })
  async listCalibrations(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.listCalibrations(id, user);
    return { success: true, data };
  }

  @Post(':id/calibrations')
  @Roles(...WRITE_ROLES)
  @UseInterceptors(fileInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Kalibratie toevoegen (optioneel met certificaat)' })
  async createCalibration(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile(optionalFilePipe) file: Express.Multer.File | undefined,
    @Body() dto: CreateCalibrationDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.createCalibration(id, user, dto, file);
    return { success: true, data };
  }

  @Get(':id/calibrations/:calId/document')
  @ApiOperation({ summary: 'Kalibratiecertificaat downloaden' })
  async downloadCalibrationDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('calId', ParseUUIDPipe) calId: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const { buffer, calibration } = await this.service.getCalibrationDocument(id, calId, user);
    res.set({
      'Content-Type': calibration.mimeType!,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(calibration.originalName!)}"`,
      'Content-Length': buffer.length.toString(),
    });
    res.send(buffer);
  }

  @Delete(':id/calibrations/:calId/document')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Alleen het kalibratiecertificaat verwijderen' })
  async removeCalibrationDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('calId', ParseUUIDPipe) calId: string,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.removeCalibrationDocument(id, calId, user);
    return { success: true, data };
  }

  @Patch(':id/calibrations/:calId')
  @Roles(...WRITE_ROLES)
  @UseInterceptors(fileInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Kalibratie bijwerken (optioneel certificaat vervangen)' })
  async updateCalibration(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('calId', ParseUUIDPipe) calId: string,
    @UploadedFile(optionalFilePipe) file: Express.Multer.File | undefined,
    @Body() dto: UpdateCalibrationDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.updateCalibration(id, calId, user, dto, file);
    return { success: true, data };
  }

  @Delete(':id/calibrations/:calId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Kalibratie verwijderen' })
  async removeCalibration(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('calId', ParseUUIDPipe) calId: string,
    @CurrentUser() user: User,
  ) {
    await this.service.removeCalibration(id, calId, user);
    return { success: true, message: 'Kalibratie verwijderd' };
  }

  // ─── Instrument detail/writes (param-routes laatst) ─────

  @Get(':id')
  @ApiOperation({ summary: 'Meetmiddel detail (incl. kalibraties)' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    const data = await this.service.findOne(id, user);
    return { success: true, data };
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Meetmiddel bijwerken (incl. toewijzing/status)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateMeasurementInstrumentDto,
  ) {
    const data = await this.service.update(id, user, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Meetmiddel verwijderen' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.service.remove(id, user);
    return { success: true, message: 'Meetmiddel verwijderd' };
  }
}
