import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
import { UsersService } from './users.service';
import {
  InviteUserDto,
  AcceptInvitationDto,
  ChangeRoleDto,
  UpdateProfileDto,
  AdminResetPasswordDto,
} from './dto';
import { Roles, CurrentUser, Public } from '@/common/decorators';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Gebruikers van organisatie ophalen' })
  @ApiResponse({ status: 200, description: 'Lijst van gebruikers' })
  async findAll(@CurrentUser() user: User) {
    const users = await this.usersService.findAllByOrg(user.orgId, user.role);
    return { success: true, data: users };
  }

  @Get(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Gebruiker ophalen op ID' })
  @ApiResponse({ status: 200, description: 'Gebruiker details' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const found = await this.usersService.findOne(id);
    if (user.role !== Role.SUPERUSER && found.orgId !== user.orgId) {
      throw new ForbiddenException();
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...rest } = found;
    return { success: true, data: rest };
  }

  @Post('invite')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Gebruiker uitnodigen voor de organisatie' })
  @ApiResponse({ status: 201, description: 'Uitnodiging verstuurd' })
  @ApiResponse({ status: 409, description: 'Gebruiker of uitnodiging bestaat al' })
  async invite(@Body() dto: InviteUserDto, @CurrentUser() user: User) {
    const invitation = await this.usersService.invite(user.orgId, dto, user);
    return { success: true, data: invitation };
  }

  @Public()
  @Post('accept-invitation')
  @ApiOperation({ summary: 'Uitnodiging accepteren en account aanmaken' })
  @ApiResponse({ status: 201, description: 'Account aangemaakt' })
  @ApiResponse({ status: 400, description: 'Ongeldige of verlopen uitnodiging' })
  async acceptInvitation(@Body() dto: AcceptInvitationDto) {
    const user = await this.usersService.acceptInvitation(dto);
    return { success: true, data: user };
  }

  @Patch(':id/deactivate')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
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
}
