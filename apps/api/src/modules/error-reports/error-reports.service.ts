import { Injectable, NotFoundException } from '@nestjs/common';
import { User, Role, NotificationType } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateErrorReportDto,
  ListErrorReportsQueryDto,
  UpdateErrorReportStatusDto,
} from './dto';

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
};

const orgSelect = {
  id: true,
  name: true,
  slug: true,
};

@Injectable()
export class ErrorReportsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(dto: CreateErrorReportDto, user: User) {
    const report = await this.prisma.errorReport.create({
      data: {
        orgId: user.orgId ?? null,
        userId: user.id,
        errorMessage: dto.errorMessage,
        stackTrace: dto.stackTrace ?? null,
        componentStack: dto.componentStack ?? null,
        userDescription: dto.userDescription ?? null,
        pageUrl: dto.pageUrl ?? null,
        userAgent: dto.userAgent ?? null,
        metadata: dto.metadata ? (dto.metadata as any) : null,
      },
    });

    // Only dispatch notification when reporter belongs to an org
    // (superusers reporting to themselves don't need a notification)
    if (user.orgId) {
      const superusers = await this.prisma.user.findMany({
        where: {
          roles: { has: Role.SUPERUSER },
          isDeleted: false,
          isActive: true,
        },
        select: { id: true },
      });

      const recipientUserIds = superusers.map((u) => u.id);

      if (recipientUserIds.length > 0) {
        this.notifications.dispatch({
          type: NotificationType.FOUTMELDING_INGEDIEND,
          orgId: user.orgId,
          recipientUserIds,
          title: 'Foutmelding ingediend',
          body: `Een gebruiker heeft een foutmelding ingediend: ${dto.errorMessage.slice(0, 120)}`,
          entityType: 'ErrorReport',
          entityId: report.id,
        });
      }
    }

    return report;
  }

  async findAll(query: ListErrorReportsQueryDto) {
    const { status, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = status ? { status } : {};

    const [data, total] = await Promise.all([
      this.prisma.errorReport.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: userSelect },
          organization: { select: orgSelect },
        },
      }),
      this.prisma.errorReport.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string) {
    const report = await this.prisma.errorReport.findUnique({
      where: { id },
      include: {
        user: { select: userSelect },
        organization: { select: orgSelect },
      },
    });

    if (!report) {
      throw new NotFoundException('Foutmelding niet gevonden');
    }

    return report;
  }

  async updateStatus(id: string, dto: UpdateErrorReportStatusDto) {
    const report = await this.prisma.errorReport.findUnique({ where: { id } });

    if (!report) {
      throw new NotFoundException('Foutmelding niet gevonden');
    }

    return this.prisma.errorReport.update({
      where: { id },
      data: { status: dto.status },
      include: {
        user: { select: userSelect },
        organization: { select: orgSelect },
      },
    });
  }
}
