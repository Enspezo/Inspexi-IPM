import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  ParseUUIDPipe,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { User, Role } from '@prisma/client';
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
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Organisatie ophalen op ID' })
  @ApiResponse({ status: 200, description: 'Organisatie details' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    if (user.role !== Role.SUPERUSER && user.orgId !== id) {
      throw new ForbiddenException('Geen toegang tot deze organisatie');
    }
    const org = await this.organizationsService.findOne(id);
    return { success: true, data: org };
  }

  @Patch(':id')
  @Roles(Role.SUPERUSER, Role.ORG_ADMIN)
  @ApiOperation({ summary: 'Organisatie instellingen bijwerken' })
  @ApiResponse({ status: 200, description: 'Organisatie bijgewerkt' })
  @ApiResponse({ status: 404, description: 'Niet gevonden' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganizationDto,
    @CurrentUser() user: User,
  ) {
    if (user.role !== Role.SUPERUSER && user.orgId !== id) {
      throw new ForbiddenException('Geen toegang tot deze organisatie');
    }
    const org = await this.organizationsService.update(id, dto);
    return { success: true, data: org };
  }
}
