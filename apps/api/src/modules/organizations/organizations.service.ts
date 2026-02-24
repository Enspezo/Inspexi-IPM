import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto) {
    const existing = await this.prisma.organization.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Slug is al in gebruik');
    }

    return this.prisma.organization.create({ data: dto });
  }

  async findAll() {
    return this.prisma.organization.findMany({
      include: { _count: { select: { users: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!org) {
      throw new NotFoundException('Organisatie niet gevonden');
    }
    return org;
  }

  async findUsers(orgId: string) {
    await this.findOne(orgId);
    return this.prisma.user.findMany({
      where: { orgId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findBySlug(slug: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug },
    });
    if (!org) {
      throw new NotFoundException('Organisatie niet gevonden');
    }
    return org;
  }

  async update(id: string, dto: UpdateOrganizationDto) {
    await this.findOne(id);

    if (dto.slug) {
      const existing = await this.prisma.organization.findFirst({
        where: { slug: dto.slug, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException('Slug is al in gebruik');
      }
    }

    return this.prisma.organization.update({
      where: { id },
      data: dto,
    });
  }
}
