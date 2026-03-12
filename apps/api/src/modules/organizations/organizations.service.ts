import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma';
import { CreateOrganizationDto, UpdateOrganizationDto } from './dto';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '@/common/services/storage/storage.interface';

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
  ) {}

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
        roles: true,
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

  async uploadLogo(id: string, file: Express.Multer.File): Promise<string> {
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException(
        'Alleen PNG, JPEG, SVG en WebP afbeeldingen zijn toegestaan',
      );
    }

    const org = await this.findOne(id);

    // Verwijder het oude logo als dat bestaat
    if (org.logoUrl) {
      await this.storage.delete(org.logoUrl).catch(() => {});
    }

    const ext = file.originalname.split('.').pop() ?? 'png';
    const storageKey = `logos/${id}/${randomUUID()}.${ext}`;
    await this.storage.upload(storageKey, file.buffer, file.mimetype);

    await this.prisma.organization.update({
      where: { id },
      data: { logoUrl: storageKey },
    });

    return storageKey;
  }

  async downloadLogo(
    id: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const org = await this.findOne(id);
    if (!org.logoUrl) {
      throw new NotFoundException('Geen logo gevonden');
    }

    const buffer = await this.storage.download(org.logoUrl);

    // Bepaal mimeType op basis van extensie
    const ext = org.logoUrl.split('.').pop()?.toLowerCase() ?? 'png';
    const mimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      svg: 'image/svg+xml',
      webp: 'image/webp',
    };
    const mimeType = mimeMap[ext] ?? 'image/png';

    return { buffer, mimeType };
  }

  async deleteLogo(id: string): Promise<void> {
    const org = await this.findOne(id);
    if (!org.logoUrl) return;

    await this.storage.delete(org.logoUrl).catch(() => {});
    await this.prisma.organization.update({
      where: { id },
      data: { logoUrl: null },
    });
  }
}
