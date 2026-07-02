import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { ALL_STAFF, CRM_ROLES } from '@/common/auth/roles';
import { Roles, CurrentUser } from '@/common/decorators';
import { PlanningService } from './planning.service';
import { PlanningSessionsService } from './planning-sessions.service';
import { PlanningFollowersService } from './planning-followers.service';
import {
  CreatePlanningItemDto,
  UpdatePlanningItemDto,
  AssignInspectorsDto,
  RejectPlanningDto,
  ReschedulePlanningDto,
  AddQuestionDto,
  AddFollowerDto,
  ListPlanningQueryDto,
  CreateSessionDto,
  UpdateSessionDto,
  AssignSessionInspectorsDto,
  RejectSessionDto,
  RescheduleSessionDto,
  UpdatePlanningStatusDto,
} from './dto';

@ApiTags('Planning')
@ApiBearerAuth()
@RequiresFeature('UITVOERING_COMPLEET')
@Controller('planning')
export class PlanningController {
  constructor(
    private readonly service: PlanningService,
    private readonly sessionsService: PlanningSessionsService,
    private readonly followersService: PlanningFollowersService,
  ) {}

  // ─── List & Create ─────────────────────────────────────────

  @Get()
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Planregels ophalen' })
  async findAll(@CurrentUser() user: User, @Query() query: ListPlanningQueryDto) {
    const result = await this.service.findAll(user, query);
    return { success: true, data: result };
  }

  @Post()
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Planregel aanmaken' })
  @ApiResponse({ status: 201, description: 'Planregel aangemaakt' })
  async create(@Body() dto: CreatePlanningItemDto, @CurrentUser() user: User) {
    const data = await this.service.create(dto, user);
    return { success: true, data };
  }

  // ─── Sessions (multi-day) ──────────────────────────────────
  // NOTE: these routes must stay ABOVE the bare :id routes

  @Get(':id/sessions')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Sessies van een planregel ophalen' })
  async findSessions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    const data = await this.sessionsService.findSessions(id, user);
    return { success: true, data };
  }

  @Post(':id/sessions')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Extra sessie toevoegen aan planregel' })
  @ApiResponse({ status: 201, description: 'Sessie aangemaakt' })
  async addSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSessionDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.sessionsService.addSession(id, dto, user);
    return { success: true, data };
  }

  @Patch(':id/sessions/:sessionId')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Sessie bijwerken (datum/duur/notitie)' })
  async updateSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: UpdateSessionDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.sessionsService.updateSession(id, sessionId, dto, user);
    return { success: true, data };
  }

  @Delete(':id/sessions/:sessionId')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Sessie annuleren (VERVALLEN)' })
  @HttpCode(HttpStatus.OK)
  async cancelSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: User,
  ) {
    await this.sessionsService.cancelSession(id, sessionId, user);
    return { success: true, message: 'Sessie geannuleerd' };
  }

  @Post(':id/sessions/:sessionId/assign')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Inspecteurs toewijzen aan sessie' })
  @HttpCode(HttpStatus.OK)
  async assignSessionInspectors(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: AssignSessionInspectorsDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.sessionsService.assignSessionInspectors(id, sessionId, dto, user);
    return { success: true, data };
  }

  @Post(':id/sessions/:sessionId/accept')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.INSPECTEUR)
  @ApiOperation({ summary: 'Sessie accepteren (inspecteur)' })
  @HttpCode(HttpStatus.OK)
  async acceptSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: User,
  ) {
    await this.sessionsService.acceptSession(id, sessionId, user);
    return { success: true, message: 'Sessie geaccepteerd' };
  }

  @Post(':id/sessions/:sessionId/reject')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.INSPECTEUR)
  @ApiOperation({ summary: 'Sessie weigeren (inspecteur)' })
  @HttpCode(HttpStatus.OK)
  async rejectSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: RejectSessionDto,
    @CurrentUser() user: User,
  ) {
    await this.sessionsService.rejectSession(id, sessionId, dto, user);
    return { success: true, message: 'Sessie geweigerd' };
  }

  @Post(':id/sessions/:sessionId/confirm')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Sessie handmatig bevestigen als DEFINITIEF (planner override)' })
  @HttpCode(HttpStatus.OK)
  async confirmSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: User,
  ) {
    await this.sessionsService.confirmSession(id, sessionId, user);
    return { success: true, message: 'Sessie bevestigd' };
  }

  @Post(':id/sessions/:sessionId/reschedule')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Sessie verzetten (vervangt huidige sessie)' })
  @HttpCode(HttpStatus.OK)
  async rescheduleSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: RescheduleSessionDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.sessionsService.rescheduleSession(id, sessionId, dto, user);
    return { success: true, data };
  }

  @Post(':id/sessions/:sessionId/complete')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Sessie afronden (AFGEROND)' })
  @HttpCode(HttpStatus.OK)
  async completeSession(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentUser() user: User,
  ) {
    await this.sessionsService.completeSession(id, sessionId, user);
    return { success: true, message: 'Sessie afgerond' };
  }

  // ─── Detail & Update ───────────────────────────────────────

  @Get(':id')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Planregel ophalen' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    const data = await this.service.findOne(id, user);
    return { success: true, data };
  }

  @Patch(':id/status')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Status van planregel direct wijzigen' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanningStatusDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.updatePlanningStatus(id, dto, user);
    return { success: true, data };
  }

  @Patch(':id')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Planregel bijwerken' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanningItemDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.update(id, dto, user);
    return { success: true, data };
  }

  // ─── Inspector actions ─────────────────────────────────────

  @Post(':id/assign')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Inspecteurs toewijzen' })
  async assignInspectors(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignInspectorsDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.assignInspectors(id, dto, user);
    return { success: true, data };
  }

  @Post(':id/accept')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.INSPECTEUR)
  @ApiOperation({ summary: 'Afspraak accepteren (inspecteur)' })
  @HttpCode(HttpStatus.OK)
  async accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.service.acceptPlanning(id, user);
    return { success: true, message: 'Afspraak geaccepteerd' };
  }

  @Post(':id/reject')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.INSPECTEUR)
  @ApiOperation({ summary: 'Afspraak weigeren (inspecteur)' })
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectPlanningDto,
    @CurrentUser() user: User,
  ) {
    await this.service.rejectPlanning(id, dto, user);
    return { success: true, message: 'Afspraak geweigerd' };
  }

  @Post(':id/complete')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Afspraak afronden' })
  @HttpCode(HttpStatus.OK)
  async complete(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.service.completePlanning(id, user);
    return { success: true, message: 'Afspraak afgerond' };
  }

  @Post(':id/reschedule')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Afspraak verzetten (maakt nieuwe planregel)' })
  @HttpCode(HttpStatus.OK)
  async reschedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReschedulePlanningDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.reschedulePlanning(id, dto, user);
    return { success: true, data };
  }

  @Post(':id/send-confirmation')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Bevestigings-e-mail opnieuw versturen' })
  @HttpCode(HttpStatus.OK)
  async sendConfirmation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.service.sendConfirmation(id, user);
    return { success: true, message: 'Bevestiging verstuurd' };
  }

  // ─── Questions ─────────────────────────────────────────────

  @Get(':id/questions')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Vragen & antwoorden ophalen' })
  async getQuestions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    const data = await this.service.getQuestions(id, user);
    return { success: true, data };
  }

  @Post(':id/questions')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Vraag of antwoord toevoegen' })
  async addQuestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddQuestionDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.service.addQuestion(id, dto, user);
    return { success: true, data };
  }

  // ─── Followers ─────────────────────────────────────────────

  @Get(':id/followers')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Volgers ophalen' })
  async getFollowers(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    const data = await this.followersService.getFollowers(id, user);
    return { success: true, data };
  }

  @Post(':id/followers')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Volger toevoegen' })
  async addFollower(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddFollowerDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.followersService.addFollower(id, dto, user);
    return { success: true, data };
  }

  @Delete(':id/followers/:followerId')
  @Roles(...CRM_ROLES)
  @ApiOperation({ summary: 'Volger verwijderen' })
  async removeFollower(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('followerId', ParseUUIDPipe) followerId: string,
    @CurrentUser() user: User,
  ) {
    await this.followersService.removeFollower(id, followerId, user);
    return { success: true, data: null };
  }
}
