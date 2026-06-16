import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
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
import { ORG_ADMINS } from '@/common/auth/roles';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto';
import { Roles, CurrentUser, Public } from '@/common/decorators';
import { PrismaService } from '@/prisma';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private organizationsService: OrganizationsService,
    private prisma: PrismaService,
  ) {}

  @Post()
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Nieuwe organisatie aanmaken (Superuser)' })
  @ApiResponse({ status: 201, description: 'Organisatie aangemaakt' })
  @ApiResponse({ status: 403, description: 'Niet geautoriseerd' })
  @ApiResponse({ status: 409, description: 'Slug al in gebruik' })
  async create(@Body() dto: CreateOrganizationDto) {
    const org = await this.organizationsService.create(dto);
    return { success: true, data: org };
  }

  @Get()
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Alle organisaties ophalen (Superuser)' })
  @ApiResponse({ status: 200, description: 'Lijst van organisaties' })
  async findAll() {
    const orgs = await this.organizationsService.findAll();
    return { success: true, data: orgs };
  }

  @Public()
  @Get('by-slug/:slug')
  @ApiOperation({ summary: 'Publieke branding info ophalen op slug (login pagina)' })
  @ApiResponse({ status: 200, description: 'Organisatie branding' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findBySlug(@Param('slug') slug: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        primaryColor: true,
      },
    });
    if (!org) {
      throw new NotFoundException('Organisatie niet gevonden');
    }
    return { success: true, data: org };
  }

  @Get(':id/users')
  @Roles(Role.SUPERUSER)
  @ApiOperation({ summary: 'Gebruikers van een organisatie ophalen (Superuser)' })
  @ApiResponse({ status: 200, description: 'Lijst van gebruikers' })
  async findUsers(@Param('id', ParseUUIDPipe) id: string) {
    const users = await this.organizationsService.findUsers(id);
    return { success: true, data: users };
  }

  @Get(':id')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Organisatie ophalen op ID' })
  @ApiResponse({ status: 200, description: 'Organisatie details' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    if (!user.roles.includes(Role.SUPERUSER) && user.orgId !== id) {
      throw new ForbiddenException('Geen toegang tot deze organisatie');
    }
    const org = await this.organizationsService.findOne(id);
    return { success: true, data: org };
  }

  @Patch(':id')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Organisatie instellingen bijwerken' })
  @ApiResponse({ status: 200, description: 'Organisatie bijgewerkt' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: User,
  ) {
    if (!user.roles.includes(Role.SUPERUSER) && user.orgId !== id) {
      throw new ForbiddenException('Geen toegang tot deze organisatie');
    }
    const org = await this.organizationsService.update(id, dto);
    return { success: true, data: org };
  }

  @Post(':id/logo')
  @Roles(...ORG_ADMINS)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Logo uploaden voor organisatie' })
  @ApiResponse({ status: 200, description: 'Logo geüpload' })
  async uploadLogo(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: User,
  ) {
    if (!user.roles.includes(Role.SUPERUSER) && user.orgId !== id) {
      throw new ForbiddenException('Geen toegang tot deze organisatie');
    }
    if (!file) {
      throw new NotFoundException('Geen bestand ontvangen');
    }
    const storageKey = await this.organizationsService.uploadLogo(id, file);
    return { success: true, data: { storageKey } };
  }

  @Public()
  @Get(':id/logo')
  @ApiOperation({ summary: 'Logo ophalen voor organisatie' })
  @ApiResponse({ status: 200, description: 'Logo afbeelding' })
  @ApiResponse({ status: 404, description: 'Geen logo gevonden' })
  async getLogo(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { buffer, mimeType } =
      await this.organizationsService.downloadLogo(id);
    res.set({
      'Content-Type': mimeType,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'public, max-age=86400',
    });
    res.send(buffer);
  }

  @Delete(':id/logo')
  @Roles(...ORG_ADMINS)
  @ApiOperation({ summary: 'Logo verwijderen van organisatie' })
  @ApiResponse({ status: 200, description: 'Logo verwijderd' })
  async deleteLogo(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    if (!user.roles.includes(Role.SUPERUSER) && user.orgId !== id) {
      throw new ForbiddenException('Geen toegang tot deze organisatie');
    }
    await this.organizationsService.deleteLogo(id);
    return { success: true, data: null };
  }
}
