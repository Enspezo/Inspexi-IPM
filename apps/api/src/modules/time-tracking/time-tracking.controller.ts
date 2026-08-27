// Urenregistratie inspecteurs (add-on, PRD-16). Alle routes dragen de
// URENREGISTRATIE-feature-gate. Schrijven doet alleen de inspecteur zelf
// (PWA); staf leest, corrigeert (PATCH, service-laag bewaakt de rollen) en
// beoordeelt weekstaten. NB route-volgorde: `timesheets/export` staat vóór
// `timesheets/:id`.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role, User } from '@prisma/client';
import { CurrentUser, Roles } from '@/common/decorators';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ALL_STAFF, CRM_ROLES, MANAGEMENT_ROLES } from '@/common/auth/roles';
import { ParseUuidPipe } from '@/common';
import { Throttle } from '@nestjs/throttler';
import { TimeEntriesService } from './time-entries.service';
import { TimesheetsService } from './timesheets.service';
import { LocationPingsService } from './location-pings.service';
import {
  CreateTimeEntryDto,
  IngestPingsDto,
  ListTimeEntriesQueryDto,
  ListTimesheetsQueryDto,
  RejectTimesheetDto,
  StartTimeEntryDto,
  UpdateTimeEntryDto,
  UpdateTravelTrackingDto,
} from './dto';

@ApiTags('time-tracking')
@ApiBearerAuth()
@RequiresFeature('URENREGISTRATIE')
@Controller()
export class TimeTrackingController {
  constructor(
    private readonly timeEntries: TimeEntriesService,
    private readonly timesheets: TimesheetsService,
    private readonly locationPings: LocationPingsService,
  ) {}

  // ─── Locatietracking (PRD-16 fase 3) ───────────────────

  @Patch('users/me/travel-tracking')
  @Roles(Role.INSPECTEUR)
  @ApiOperation({ summary: 'Onderweg-tracker aan/uit (opt-in, alleen de gebruiker zelf; consent wordt vastgelegd)' })
  async setTravelTracking(@CurrentUser() user: User, @Body() dto: UpdateTravelTrackingDto) {
    return { success: true, data: await this.locationPings.setTravelTracking(user, dto.enabled) };
  }

  @Post('time-tracking/pings')
  @Roles(Role.INSPECTEUR)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Batch locatie-pings tijdens een lopende REISTIJD-timer (tracker aan vereist; anders 200-noop met accepted: 0)',
  })
  async ingestPings(@CurrentUser() user: User, @Body() dto: IngestPingsDto) {
    return { success: true, data: await this.locationPings.ingest(user, dto) };
  }

  @Get('time-tracking/active')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Lopende timers per inspecteur (incl. of er een live positie is) — "Nu actief"' })
  async active(@CurrentUser() user: User) {
    return { success: true, data: await this.locationPings.getActive(user) };
  }

  @Get('time-tracking/locations/:userId/latest')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Laatste positie (< 30 min) van een inspecteur + bestemming van de reistimer' })
  @ApiResponse({ status: 404, description: 'Geen recente positie beschikbaar' })
  async latestLocation(@Param('userId', ParseUuidPipe) userId: string, @CurrentUser() user: User) {
    return { success: true, data: await this.locationPings.getLatestLocation(userId, user) };
  }

  // ─── Urenregels ────────────────────────────────────────

  @Post('time-entries/start')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.INSPECTEUR)
  @ApiOperation({ summary: 'Timer starten (stopt een lopende timer atomisch — één timer tegelijk)' })
  @ApiResponse({ status: 201, description: 'Nieuwe regel + eventueel gestopte regel' })
  @ApiResponse({ status: 400, description: 'Project ontbreekt voor deze activiteit' })
  @ApiResponse({ status: 409, description: 'Race met een andere start / week al ingediend' })
  async start(@CurrentUser() user: User, @Body() dto: StartTimeEntryDto) {
    return { success: true, data: await this.timeEntries.start(user, dto) };
  }

  @Post('time-entries/stop')
  @Roles(Role.INSPECTEUR)
  @ApiOperation({ summary: 'Eigen lopende timer stoppen' })
  @ApiResponse({ status: 404, description: 'Er loopt geen timer' })
  async stop(@CurrentUser() user: User) {
    return { success: true, data: await this.timeEntries.stop(user) };
  }

  @Get('time-entries/running')
  @Roles(Role.INSPECTEUR)
  @ApiOperation({ summary: 'Eigen lopende timer (of null) — voor de PWA-timerbalk' })
  async running(@CurrentUser() user: User) {
    return { success: true, data: await this.timeEntries.findRunning(user) };
  }

  @Get('time-entries')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Urenregels (staf: hele org; INSPECTEUR: alleen eigen regels)' })
  async findAllEntries(@CurrentUser() user: User, @Query() query: ListTimeEntriesQueryDto) {
    return { success: true, data: await this.timeEntries.findAll(user, query) };
  }

  @Post('time-entries')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.INSPECTEUR)
  @ApiOperation({ summary: 'Handmatige (afgeronde) urenregel toevoegen' })
  async createEntry(@CurrentUser() user: User, @Body() dto: CreateTimeEntryDto) {
    return { success: true, data: await this.timeEntries.createManual(user, dto) };
  }

  @Patch('time-entries/:id')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Urenregel bijwerken (inspecteur: eigen open week; manager: correctie)' })
  @ApiResponse({ status: 409, description: 'Weekstaat ingediend/goedgekeurd' })
  async updateEntry(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateTimeEntryDto,
  ) {
    return { success: true, data: await this.timeEntries.update(id, user, dto) };
  }

  @Delete('time-entries/:id')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Urenregel verwijderen (soft-delete)' })
  async removeEntry(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.timeEntries.remove(id, user) };
  }

  // ─── Weekstaten ────────────────────────────────────────

  @Get('timesheets')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Weekstaten incl. totalen (staf: hele org; INSPECTEUR: alleen eigen)' })
  async findAllTimesheets(@CurrentUser() user: User, @Query() query: ListTimesheetsQueryDto) {
    return { success: true, data: await this.timesheets.findAll(user, query) };
  }

  @Get('timesheets/export')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'CSV-export van urenregels (Excel-compatibel; zelfde filters als /time-entries)' })
  async export(
    @CurrentUser() user: User,
    @Query() query: ListTimeEntriesQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.timesheets.exportCsv(user, query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="urenexport.csv"');
    return csv;
  }

  @Get('timesheets/:id')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Weekstaat-detail incl. urenregels en totalen' })
  async findOneTimesheet(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.timesheets.findOne(id, user) };
  }

  @Post('timesheets/:id/submit')
  @Roles(Role.INSPECTEUR)
  @ApiOperation({ summary: 'Eigen weekstaat indienen (CONCEPT/AFGEWEZEN → INGEDIEND)' })
  @ApiResponse({ status: 409, description: 'Lopende timer of niet-toegewezen reistijd in deze week' })
  async submit(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.timesheets.submit(id, user) };
  }

  @Post('timesheets/:id/approve')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'Ingediende weekstaat goedkeuren' })
  async approve(@Param('id', ParseUuidPipe) id: string, @CurrentUser() user: User) {
    return { success: true, data: await this.timesheets.approve(id, user) };
  }

  @Post('timesheets/:id/reject')
  @Roles(...MANAGEMENT_ROLES)
  @ApiOperation({ summary: 'Ingediende weekstaat afwijzen (toelichting verplicht)' })
  async reject(
    @Param('id', ParseUuidPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RejectTimesheetDto,
  ) {
    return { success: true, data: await this.timesheets.reject(id, user, dto.note) };
  }
}
