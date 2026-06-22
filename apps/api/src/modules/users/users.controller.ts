import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  ForbiddenException,
  NotFoundException,
  UseInterceptors,
  UploadedFile,
  Res,
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
import { ORG_ADMINS, ALL_STAFF } from '@/common/auth/roles';
import { UsersService } from './users.service';
import {
  InviteUserDto,
  AcceptInvitationDto,
  ChangeRoleDto,
  UpdateProfileDto,
  AdminUpdateUserDto,
  AdminResetPasswordDto,
  UpdateSignatureDto,
  UpdateColorDto,
  DeleteUserDto,
  ListSelectableUsersQueryDto,
  UpdatePresenceDto,
} from './dto';
import { Throttle } from '@nestjs/throttler';
import { Roles, CurrentUser, Public } from '@/common/decorators';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  // ─── List ─────────────────────────────────────────────
  @Get()
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Gebruikers van organisatie ophalen' })
  @ApiResponse({ status: 200, description: 'Lijst van gebruikers' })
  async findAll(@CurrentUser() user: User) {
    const users = await this.usersService.findAllByOrg(user.orgId, user.roles.includes(Role.SUPERUSER));
    return { success: true, data: users };
  }

  // ─── Selectable users (lichte lijst voor pickers; brede toegang) ──
  @Get('selectable')
  @Roles(...ALL_STAFF)
  @ApiOperation({ summary: 'Lichte gebruikerslijst voor persoon-/team-pickers (optioneel op rol gefilterd)' })
  @ApiResponse({ status: 200, description: 'Lijst van selecteerbare gebruikers' })
  async findSelectable(
    @CurrentUser() user: User,
    @Query() query: ListSelectableUsersQueryDto,
  ) {
    const users = await this.usersService.findSelectable(user.orgId, query.role);
    return { success: true, data: users };
  }

  // ─── Literal / me routes (must be before :id) ─────────
  @Get('me/signature')
  @ApiOperation({ summary: 'Eigen handtekening ophalen' })
  @ApiResponse({ status: 200, description: 'Handtekening data' })
  async getSignature(@CurrentUser() user: User) {
    const data = await this.usersService.getSignature(user.id);
    return { success: true, data };
  }

  @Patch('me/signature')
  @ApiOperation({ summary: 'Eigen handtekening opslaan' })
  @ApiResponse({ status: 200, description: 'Handtekening opgeslagen' })
  async updateSignature(
    @Body() dto: UpdateSignatureDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.usersService.updateSignature(user.id, dto);
    return { success: true, data };
  }

  @Delete('me/signature')
  @ApiOperation({ summary: 'Eigen handtekening verwijderen' })
  @ApiResponse({ status: 200, description: 'Handtekening verwijderd' })
  async deleteSignature(@CurrentUser() user: User) {
    await this.usersService.deleteSignature(user.id);
    return { success: true, data: null };
  }

  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Avatar uploaden voor eigen profiel' })
  @ApiResponse({ status: 200, description: 'Avatar geüpload' })
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ) {
    if (!file) throw new NotFoundException('Geen bestand ontvangen');
    const storageKey = await this.usersService.uploadAvatar(user.id, file);
    return { success: true, data: { storageKey } };
  }

  @Get('me/avatar')
  @ApiOperation({ summary: 'Avatar ophalen voor eigen profiel' })
  @ApiResponse({ status: 200, description: 'Avatar afbeelding' })
  @ApiResponse({ status: 404, description: 'Geen avatar gevonden' })
  async getOwnAvatar(
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    const { buffer, mimeType } = await this.usersService.downloadAvatar(user.id);
    res.set({
      'Content-Type': mimeType,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'private, max-age=3600',
    });
    res.send(buffer);
  }

  @Delete('me/avatar')
  @ApiOperation({ summary: 'Avatar verwijderen van eigen profiel' })
  @ApiResponse({ status: 200, description: 'Avatar verwijderd' })
  async deleteAvatar(@CurrentUser() user: User) {
    await this.usersService.deleteAvatar(user.id);
    return { success: true, data: null };
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Eigen profiel bewerken' })
  @ApiResponse({ status: 200, description: 'Profiel bijgewerkt' })
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: User,
  ) {
    const updated = await this.usersService.updateProfile(user.id, dto);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...rest } = updated;
    return { success: true, data: rest };
  }

  @Post('invite')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Gebruiker uitnodigen voor de organisatie' })
  @ApiResponse({ status: 201, description: 'Uitnodiging verstuurd' })
  @ApiResponse({ status: 409, description: 'Gebruiker of uitnodiging bestaat al' })
  async invite(@Body() dto: InviteUserDto, @CurrentUser() user: User) {
    const invitation = await this.usersService.invite(user.orgId, dto, user);
    return { success: true, data: invitation };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('accept-invitation')
  @ApiOperation({ summary: 'Uitnodiging accepteren en account aanmaken' })
  @ApiResponse({ status: 201, description: 'Account aangemaakt' })
  @ApiResponse({ status: 400, description: 'Ongeldige of verlopen uitnodiging' })
  async acceptInvitation(@Body() dto: AcceptInvitationDto) {
    const user = await this.usersService.acceptInvitation(dto);
    return { success: true, data: user };
  }

  @Post('me/rotate-ical-token')
  @ApiOperation({ summary: 'iCal feed-token vernieuwen (oude feed-URL wordt direct ongeldig)' })
  @ApiResponse({ status: 201, description: 'Nieuw token gegenereerd' })
  async rotateIcalToken(@CurrentUser() user: User) {
    const data = await this.usersService.rotateIcalToken(user.id);
    return { success: true, data };
  }

  @Get('me/presence')
  @ApiOperation({ summary: 'Eigen beschikbaarheidsstatus ophalen (interne chat)' })
  @ApiResponse({ status: 200, description: 'Presence' })
  async getPresence(@CurrentUser() user: User) {
    const data = await this.usersService.getPresence(user.id);
    return { success: true, data };
  }

  @Patch('me/presence')
  @ApiOperation({ summary: 'Eigen beschikbaarheidsstatus instellen (interne chat)' })
  @ApiResponse({ status: 200, description: 'Presence bijgewerkt' })
  async updatePresence(@Body() dto: UpdatePresenceDto, @CurrentUser() user: User) {
    const data = await this.usersService.updatePresence(
      user.id,
      dto.availability,
      dto.availabilityNote ?? null,
    );
    return { success: true, data };
  }

  // ─── Parameterized :id routes ─────────────────────────
  @Get(':id/record-counts')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Aantal records van een gebruiker ophalen voor overdracht' })
  @ApiResponse({ status: 200, description: 'Record counts' })
  async getRecordCounts(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const counts = await this.usersService.getRecordCounts(id, user);
    return { success: true, data: counts };
  }

  @Post(':id/delete')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Gebruiker verwijderen (soft delete met overdracht)' })
  @ApiResponse({ status: 200, description: 'Gebruiker verwijderd' })
  async softDelete(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeleteUserDto,
    @CurrentUser() user: User,
  ) {
    await this.usersService.softDelete(id, dto.transferToUserId, user);
    return { success: true, message: 'Gebruiker verwijderd en records overgedragen' };
  }

  @Get(':id')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Gebruiker ophalen op ID' })
  @ApiResponse({ status: 200, description: 'Gebruiker details' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const found = await this.usersService.findOne(id);
    if (!user.roles.includes(Role.SUPERUSER) && found.orgId !== user.orgId) {
      throw new ForbiddenException();
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...rest } = found;
    return { success: true, data: rest };
  }

  @Patch(':id/deactivate')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Gebruiker deactiveren (soft delete)' })
  @ApiResponse({ status: 200, description: 'Gebruiker gedeactiveerd' })
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.usersService.deactivate(id, user);
    return { success: true, message: 'Gebruiker gedeactiveerd' };
  }

  @Patch(':id/activate')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Gebruiker heractiveren' })
  @ApiResponse({ status: 200, description: 'Gebruiker geactiveerd' })
  async activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.usersService.activate(id, user);
    return { success: true, message: 'Gebruiker geactiveerd' };
  }

  @Patch(':id/role')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Gebruikersrol wijzigen' })
  @ApiResponse({ status: 200, description: 'Rol gewijzigd' })
  async changeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() user: User,
  ) {
    await this.usersService.changeRole(id, dto, user);
    return { success: true, message: 'Rol gewijzigd' };
  }

  @Patch(':id/reset-password')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Wachtwoord van gebruiker resetten (admin)' })
  @ApiResponse({ status: 200, description: 'Wachtwoord gereset' })
  @ApiResponse({ status: 403, description: 'Geen bevoegdheid' })
  async adminResetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminResetPasswordDto,
    @CurrentUser() user: User,
  ) {
    await this.usersService.adminResetPassword(id, dto.newPassword, user);
    return { success: true, message: 'Wachtwoord gereset' };
  }

  @Patch(':id/color')
  @ApiOperation({ summary: 'Inspecteurkleur instellen (eigen profiel of ORG_ADMIN)' })
  @ApiResponse({ status: 200, description: 'Kleur bijgewerkt' })
  async updateColor(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateColorDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.usersService.updateColor(id, dto.color, user);
    return { success: true, data };
  }

  // ─── Admin update (generic, last to avoid swallowing literals) ──
  @Patch(':id')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Gebruikersgegevens bijwerken (admin)' })
  @ApiResponse({ status: 200, description: 'Gebruiker bijgewerkt' })
  async adminUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateUserDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.usersService.adminUpdateUser(id, dto, user);
    return { success: true, data };
  }
}
