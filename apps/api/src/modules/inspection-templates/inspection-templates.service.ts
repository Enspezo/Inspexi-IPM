import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Prisma, TemplateStatus } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound } from '@/common';
import {
  CreateInspectionTemplateDto,
  UpdateInspectionTemplateDto,
  ForkInspectionTemplateDto,
  PublishInspectionTemplateDto,
  RetireInspectionTemplateDto,
  NewVersionDto,
  AddChecklistLinkDto,
  AddMeasurementSheetLinkDto,
} from './dto';

const CHECKLIST_LINK_INCLUDE = {
  checklist: {
    select: {
      id: true,
      code: true,
      name: true,
      version: true,
      status: true,
      _count: { select: { itemLinks: true } },
    },
  },
} satisfies Prisma.InspectionTemplateChecklistLinkInclude;

const MEASUREMENT_LINK_INCLUDE = {
  measurementSheetTemplate: {
    select: { id: true, code: true, name: true, version: true, status: true },
  },
} satisfies Prisma.InspectionTemplateMeasurementSheetLinkInclude;

@Injectable()
export class InspectionTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Alle (zichtbare) inspectie-templates: eigen org + systeem. Superuser (orgId null) ziet alles. */
  async findAll(
    user: User,
    options?: {
      normType?: string;
      status?: TemplateStatus;
      includeSystem?: boolean;
      search?: string;
    },
  ) {
    const orgId = user.orgId;
    const { normType, status, includeSystem = true, search } = options || {};

    const andConditions: Prisma.InspectionTemplateWhereInput[] = [];

    if (orgId) {
      andConditions.push({
        OR: [
          { orgId },
          ...(includeSystem ? [{ orgId: null, isSystem: true }] : []),
        ],
      });
    }
    if (normType) andConditions.push({ normTypeCode: normType });
    if (status) andConditions.push({ status });
    if (search) {
      andConditions.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    return this.prisma.inspectionTemplate.findMany({
      where: andConditions.length > 0 ? { AND: andConditions } : {},
      include: {
        classificationModel: { select: { id: true, code: true, name: true } },
        forkedFrom: { select: { id: true, code: true, version: true } },
        _count: {
          select: { checklistLinks: true, measurementSheetLinks: true },
        },
      },
      orderBy: [
        { isSystem: 'desc' },
        { status: 'asc' },
        { name: 'asc' },
        { version: 'desc' },
      ],
    });
  }

  /** Eén inspectie-template met alle relaties (org-scoped). */
  async findById(id: string, user: User) {
    const orgId = user.orgId;
    const template = await this.prisma.inspectionTemplate.findUnique({
      where: { id },
      include: {
        classificationModel: true,
        forkedFrom: { select: { id: true, code: true, name: true, version: true } },
        checklistLinks: {
          include: CHECKLIST_LINK_INCLUDE,
          orderBy: { sortOrder: 'asc' },
        },
        measurementSheetLinks: {
          include: MEASUREMENT_LINK_INCLUDE,
          orderBy: { sortOrder: 'asc' },
        },
        previousVersion: { select: { id: true, version: true, status: true } },
        nextVersions: { select: { id: true, version: true, status: true } },
      },
    });

    if (!template) throw new NotFoundException('Inspectie-template niet gevonden');

    // Toegangscontrole: org-rij van eigen org, of systeemrij
    if (orgId !== null) {
      const canAccess =
        template.orgId === orgId || (template.orgId === null && template.isSystem);
      if (!canAccess) throw new NotFoundException('Inspectie-template niet gevonden');
    }

    return template;
  }

  async create(user: User, dto: CreateInspectionTemplateDto) {
    const orgId = user.orgId;
    const isSystem = dto.isSystem === true && orgId === null;

    await this.assertClassificationModel(dto.classificationModelId);
    await this.assertNormType(dto.normTypeCode);

    const existing = await this.prisma.inspectionTemplate.findFirst({
      where: { orgId: isSystem ? null : orgId, code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(
        `Inspectie-template met code '${dto.code}' bestaat al`,
      );
    }

    return this.prisma.inspectionTemplate.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        normTypeCode: dto.normTypeCode,
        classificationModelId: dto.classificationModelId,
        isSystem,
        orgId: isSystem ? null : orgId,
        createdBy: user.id,
      },
      include: {
        classificationModel: { select: { id: true, code: true, name: true } },
      },
    });
  }

  /** Bijwerken (alleen CONCEPT). */
  async update(id: string, user: User, dto: UpdateInspectionTemplateDto) {
    const template = await this.findById(id, user);
    this.assertConcept(template, 'bijgewerkt');
    this.assertManageable(template, user);

    if (dto.classificationModelId) {
      await this.assertClassificationModel(dto.classificationModelId);
    }

    return this.prisma.inspectionTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        classificationModelId: dto.classificationModelId,
        updatedBy: user.id,
      },
      include: {
        classificationModel: { select: { id: true, code: true, name: true } },
      },
    });
  }

  /** Verwijderen (alleen CONCEPT). */
  async delete(id: string, user: User) {
    const template = await this.findById(id, user);
    this.assertConcept(template, 'verwijderd');
    this.assertManageable(template, user);

    await this.prisma.inspectionTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  /** Systeemtemplate forken naar de eigen org (als CONCEPT). Vereist een org. */
  async fork(id: string, user: User, dto: ForkInspectionTemplateDto) {
    const orgId = user.orgId;
    if (!orgId) {
      throw new ForbiddenException('Een organisatie is vereist om te forken');
    }

    const source = await this.findById(id, user);
    if (!source.isSystem) {
      throw new BadRequestException('Alleen systeemtemplates kunnen geforkt worden');
    }

    const existing = await this.prisma.inspectionTemplate.findFirst({
      where: { orgId, forkedFromId: id },
    });
    if (existing) {
      throw new BadRequestException(
        'Er bestaat al een fork van deze template in uw organisatie',
      );
    }

    const forkVersion = `${source.version}.1`;
    const newCode = dto.code || `${source.code}-FORK`;

    const forked = await this.prisma.$transaction(async (tx) => {
      const created = await tx.inspectionTemplate.create({
        data: {
          code: newCode,
          name: dto.name || `${source.name} (fork)`,
          description: source.description,
          normTypeCode: source.normTypeCode,
          classificationModelId: source.classificationModelId,
          isSystem: false,
          orgId,
          forkedFromId: id,
          version: forkVersion,
          status: TemplateStatus.CONCEPT,
          createdBy: user.id,
        },
      });

      await this.copyLinks(tx, id, created.id);
      return created;
    });

    return this.findById(forked.id, user);
  }

  /** Publiceren (CONCEPT → ACTIEF) + historie. */
  async publish(id: string, user: User, dto: PublishInspectionTemplateDto) {
    const template = await this.findById(id, user);
    if (template.status !== TemplateStatus.CONCEPT) {
      throw new BadRequestException(
        'Alleen templates met status CONCEPT kunnen gepubliceerd worden',
      );
    }
    this.assertManageable(template, user);

    return this.prisma.$transaction(async (tx) => {
      await tx.inspectionTemplateVersionHistory.create({
        data: {
          inspectionTemplateId: id,
          fromVersion: template.version,
          toVersion: template.version,
          fromStatus: TemplateStatus.CONCEPT,
          toStatus: TemplateStatus.ACTIEF,
          changeDescription: dto.changeDescription || 'Template gepubliceerd',
          changedBy: user.id,
        },
      });

      return tx.inspectionTemplate.update({
        where: { id },
        data: {
          status: TemplateStatus.ACTIEF,
          publishedAt: new Date(),
          updatedBy: user.id,
        },
      });
    });
  }

  /** Laten vervallen (ACTIEF → VERVALLEN) + historie. */
  async retire(id: string, user: User, dto: RetireInspectionTemplateDto) {
    const template = await this.findById(id, user);
    if (template.status !== TemplateStatus.ACTIEF) {
      throw new BadRequestException(
        'Alleen templates met status ACTIEF kunnen vervallen',
      );
    }
    this.assertManageable(template, user);

    return this.prisma.$transaction(async (tx) => {
      await tx.inspectionTemplateVersionHistory.create({
        data: {
          inspectionTemplateId: id,
          fromVersion: template.version,
          toVersion: template.version,
          fromStatus: TemplateStatus.ACTIEF,
          toStatus: TemplateStatus.VERVALLEN,
          changeDescription: dto.reason || 'Template vervallen',
          changedBy: user.id,
        },
      });

      return tx.inspectionTemplate.update({
        where: { id },
        data: {
          status: TemplateStatus.VERVALLEN,
          retiredAt: new Date(),
          updatedBy: user.id,
        },
      });
    });
  }

  /** Nieuwe versie maken (kloon naar CONCEPT, versie ophogen, previousVersionId + historie). */
  async createNewVersion(id: string, user: User, dto: NewVersionDto) {
    const original = await this.findById(id, user);
    this.assertManageable(original, user);

    const versionParts = original.version.split('.');
    const newVersion =
      versionParts.length > 2
        ? `${versionParts.slice(0, 2).join('.')}.${parseInt(versionParts[2], 10) + 1}`
        : `${original.version}.1`;

    const created = await this.prisma.$transaction(async (tx) => {
      const newTemplate = await tx.inspectionTemplate.create({
        data: {
          code: original.code,
          name: original.name,
          description: original.description,
          normTypeCode: original.normTypeCode,
          classificationModelId: original.classificationModelId,
          isSystem: original.isSystem,
          orgId: original.orgId,
          forkedFromId: original.forkedFromId,
          version: newVersion,
          status: TemplateStatus.CONCEPT,
          previousVersionId: id,
          createdBy: user.id,
        },
      });

      await tx.inspectionTemplateVersionHistory.create({
        data: {
          inspectionTemplateId: newTemplate.id,
          fromVersion: original.version,
          toVersion: newVersion,
          fromStatus: original.status,
          toStatus: TemplateStatus.CONCEPT,
          changeDescription:
            dto.changeDescription || `Nieuwe versie op basis van ${original.version}`,
          changedBy: user.id,
        },
      });

      await this.copyLinks(tx, id, newTemplate.id);
      return newTemplate;
    });

    return this.findById(created.id, user);
  }

  /** Versiegeschiedenis. */
  async getHistory(id: string, user: User) {
    await this.findById(id, user); // toegangscontrole
    return this.prisma.inspectionTemplateVersionHistory.findMany({
      where: { inspectionTemplateId: id },
      orderBy: { changedAt: 'desc' },
    });
  }

  // ── Checklist-links ───────────────────────────────────

  async getChecklistLinks(id: string, user: User) {
    await this.findById(id, user);
    return this.prisma.inspectionTemplateChecklistLink.findMany({
      where: { inspectionTemplateId: id },
      include: CHECKLIST_LINK_INCLUDE,
      orderBy: { sortOrder: 'asc' },
    });
  }

  async addChecklistLink(id: string, user: User, dto: AddChecklistLinkDto) {
    const template = await this.findById(id, user);
    this.assertConcept(template, 'gekoppeld');
    this.assertManageable(template, user);

    // Checklist is org-OF-systeem: laden en zichtbaarheid controleren
    const checklist = await this.prisma.checklist.findUnique({
      where: { id: dto.checklistId },
      select: { id: true, orgId: true },
    });
    if (!checklist) throw new BadRequestException('Checklist niet gevonden');
    if (checklist.orgId !== null && checklist.orgId !== user.orgId) {
      throw new ForbiddenException('Deze checklist hoort niet bij uw organisatie');
    }

    return this.prisma.inspectionTemplateChecklistLink.create({
      data: {
        inspectionTemplateId: id,
        checklistId: dto.checklistId,
        assetTypes: dto.assetTypes,
        sortOrder: dto.sortOrder,
      },
      include: CHECKLIST_LINK_INCLUDE,
    });
  }

  async removeChecklistLink(templateId: string, linkId: string, user: User) {
    const template = await this.findById(templateId, user);
    this.assertConcept(template, 'ontkoppeld');
    this.assertManageable(template, user);

    const link = await this.prisma.inspectionTemplateChecklistLink.findFirst({
      where: { id: linkId, inspectionTemplateId: templateId },
    });
    assertFound(link, 'Koppeling');

    await this.prisma.inspectionTemplateChecklistLink.delete({ where: { id: linkId } });
    return { deleted: true };
  }

  // ── Meetstaat-links ───────────────────────────────────

  async getMeasurementSheetLinks(id: string, user: User) {
    await this.findById(id, user);
    return this.prisma.inspectionTemplateMeasurementSheetLink.findMany({
      where: { inspectionTemplateId: id },
      include: MEASUREMENT_LINK_INCLUDE,
      orderBy: { sortOrder: 'asc' },
    });
  }

  async addMeasurementSheetLink(
    id: string,
    user: User,
    dto: AddMeasurementSheetLinkDto,
  ) {
    const template = await this.findById(id, user);
    this.assertConcept(template, 'gekoppeld');
    this.assertManageable(template, user);

    // Meetstaat-template is globaal → alleen bestaan controleren
    const sheet = await this.prisma.measurementSheetTemplate.findUnique({
      where: { id: dto.measurementSheetTemplateId },
      select: { id: true },
    });
    assertFound(sheet, 'Meetstaat-template');

    return this.prisma.inspectionTemplateMeasurementSheetLink.create({
      data: {
        inspectionTemplateId: id,
        measurementSheetTemplateId: dto.measurementSheetTemplateId,
        assetTypes: dto.assetTypes,
        sortOrder: dto.sortOrder,
      },
      include: MEASUREMENT_LINK_INCLUDE,
    });
  }

  async removeMeasurementSheetLink(templateId: string, linkId: string, user: User) {
    const template = await this.findById(templateId, user);
    this.assertConcept(template, 'ontkoppeld');
    this.assertManageable(template, user);

    const link = await this.prisma.inspectionTemplateMeasurementSheetLink.findFirst({
      where: { id: linkId, inspectionTemplateId: templateId },
    });
    assertFound(link, 'Koppeling');

    await this.prisma.inspectionTemplateMeasurementSheetLink.delete({
      where: { id: linkId },
    });
    return { deleted: true };
  }

  // ── Helpers ───────────────────────────────────────────

  /** Kopieer checklist- en meetstaat-links van bron naar doel (binnen een transactie). */
  private async copyLinks(
    tx: Prisma.TransactionClient,
    sourceId: string,
    targetId: string,
  ) {
    const checklistLinks = await tx.inspectionTemplateChecklistLink.findMany({
      where: { inspectionTemplateId: sourceId },
    });
    if (checklistLinks.length > 0) {
      await tx.inspectionTemplateChecklistLink.createMany({
        data: checklistLinks.map((link) => ({
          inspectionTemplateId: targetId,
          checklistId: link.checklistId,
          assetTypes: link.assetTypes,
          sortOrder: link.sortOrder,
        })),
      });
    }

    const measurementLinks = await tx.inspectionTemplateMeasurementSheetLink.findMany({
      where: { inspectionTemplateId: sourceId },
    });
    if (measurementLinks.length > 0) {
      await tx.inspectionTemplateMeasurementSheetLink.createMany({
        data: measurementLinks.map((link) => ({
          inspectionTemplateId: targetId,
          measurementSheetTemplateId: link.measurementSheetTemplateId,
          assetTypes: link.assetTypes,
          sortOrder: link.sortOrder,
        })),
      });
    }
  }

  /** Classificatiemodel is globaal → alleen bestaan controleren. */
  private async assertClassificationModel(id: string) {
    const model = await this.prisma.classificationModel.findUnique({
      where: { id },
      select: { id: true },
    });
    assertFound(model, 'Classificatiemodel');
  }

  /** normTypeCode moet bestaan in NormTypeDefinition. */
  private async assertNormType(code: string) {
    const norm = await this.prisma.normTypeDefinition.findUnique({
      where: { code },
      select: { code: true },
    });
    if (!norm) {
      throw new BadRequestException(`Normtype '${code}' bestaat niet`);
    }
  }

  /** Alleen CONCEPT mag bewerkt/verwijderd/gekoppeld worden. */
  private assertConcept(
    template: { status: TemplateStatus },
    actionLabel: string,
  ): void {
    if (template.status !== TemplateStatus.CONCEPT) {
      throw new BadRequestException(
        `Alleen templates met status CONCEPT kunnen ${actionLabel} worden`,
      );
    }
  }

  /** Systeemrijen alleen door superuser; org-rijen alleen door de eigen org. */
  private assertManageable(
    template: { isSystem: boolean; orgId: string | null },
    user: User,
  ): void {
    if (template.isSystem) {
      if (user.orgId !== null) {
        throw new ForbiddenException(
          'Systeem-templates zijn alleen-lezen. Fork eerst.',
        );
      }
    } else if (template.orgId !== user.orgId) {
      throw new ForbiddenException('Deze template hoort niet bij uw organisatie');
    }
  }
}
