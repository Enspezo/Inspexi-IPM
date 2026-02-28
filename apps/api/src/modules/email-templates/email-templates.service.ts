import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Role, Prisma, EmailTemplateType } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { TEMPLATE_TYPE_PLACEHOLDERS, EMAIL_TEMPLATE_TYPE_LABELS } from './placeholder.config';
import { renderTemplate, wrapInEmailLayout } from './template-renderer';

@Injectable()
export class EmailTemplatesService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    user: User,
    query: { search?: string; type?: EmailTemplateType; isActive?: boolean; page?: number; limit?: number },
  ) {
    const { search, type, isActive, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.EmailTemplateWhereInput = {};

    if (!user.roles.includes(Role.SUPERUSER)) {
      where.orgId = user.orgId!;
    }

    if (type) {
      where.type = type;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.emailTemplate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          creator: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.emailTemplate.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, user: User) {
    const template = await this.prisma.emailTemplate.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!template) {
      throw new NotFoundException('E-mailsjabloon niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && template.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return template;
  }

  async create(dto: CreateEmailTemplateDto, user: User) {
    const orgId = user.orgId;
    if (!orgId) {
      throw new ForbiddenException('Geen organisatie gekoppeld');
    }

    // Auto-deactivate existing active template of same type
    return this.prisma.$transaction(async (tx) => {
      await tx.emailTemplate.updateMany({
        where: { orgId, type: dto.type, isActive: true },
        data: { isActive: false },
      });

      return tx.emailTemplate.create({
        data: {
          orgId,
          type: dto.type,
          name: dto.name,
          subject: dto.subject,
          bodyJson: dto.bodyJson ?? {},
          bodyHtml: dto.bodyHtml,
          createdBy: user.id,
        },
        include: {
          creator: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });
  }

  async update(id: string, dto: UpdateEmailTemplateDto, user: User) {
    const template = await this.findOne(id, user);

    // If activating, deactivate other templates of the same type
    if (dto.isActive === true) {
      await this.prisma.emailTemplate.updateMany({
        where: {
          orgId: template.orgId,
          type: template.type,
          isActive: true,
          id: { not: template.id },
        },
        data: { isActive: false },
      });
    }

    return this.prisma.emailTemplate.update({
      where: { id: template.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.bodyJson !== undefined && { bodyJson: dto.bodyJson }),
        ...(dto.bodyHtml !== undefined && { bodyHtml: dto.bodyHtml }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async deactivate(id: string, user: User) {
    const template = await this.findOne(id, user);

    return this.prisma.emailTemplate.update({
      where: { id: template.id },
      data: { isActive: false },
    });
  }

  async duplicate(id: string, user: User) {
    const template = await this.findOne(id, user);

    return this.prisma.emailTemplate.create({
      data: {
        orgId: template.orgId,
        type: template.type,
        name: `${template.name} (kopie)`,
        subject: template.subject,
        bodyJson: template.bodyJson ?? {},
        bodyHtml: template.bodyHtml,
        isActive: false,
        createdBy: user.id,
      },
      include: {
        creator: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  getTypes() {
    return Object.entries(TEMPLATE_TYPE_PLACEHOLDERS).map(([type, placeholders]) => ({
      type,
      label: EMAIL_TEMPLATE_TYPE_LABELS[type] ?? type,
      placeholders,
    }));
  }

  preview(body: { subject: string; bodyHtml: string; type: EmailTemplateType }) {
    const sampleVars = this.getSampleVariables(body.type);
    const rendered = renderTemplate(
      { subject: body.subject, bodyHtml: body.bodyHtml },
      sampleVars,
    );
    return {
      subject: rendered.subject,
      html: wrapInEmailLayout(rendered.html, 'Voorbeeldbedrijf B.V.'),
    };
  }

  /**
   * Look up the active template for an org + type.
   * Used by EmailService and PlanningEmailService.
   */
  async getActiveTemplate(orgId: string, type: EmailTemplateType) {
    return this.prisma.emailTemplate.findFirst({
      where: { orgId, type, isActive: true },
    });
  }

  /**
   * Render an active template with variables, wrapped in email layout.
   * Returns null if no custom template exists.
   */
  async tryRender(
    orgId: string,
    type: EmailTemplateType,
    variables: Record<string, Record<string, string>>,
    orgName?: string,
  ): Promise<{ subject: string; html: string } | null> {
    const template = await this.getActiveTemplate(orgId, type);
    if (!template) return null;

    const rendered = renderTemplate(
      { subject: template.subject, bodyHtml: template.bodyHtml },
      variables,
    );

    return {
      subject: rendered.subject,
      html: wrapInEmailLayout(rendered.html, orgName),
    };
  }

  private getSampleVariables(type: EmailTemplateType): Record<string, Record<string, string>> {
    const vars: Record<string, Record<string, string>> = {};

    const groups = TEMPLATE_TYPE_PLACEHOLDERS[type] ?? [];
    for (const group of groups) {
      const fields: Record<string, string> = {};
      for (const field of group.fields) {
        fields[field.key] = this.getSampleValue(group.entity, field.key);
      }
      vars[group.entity] = fields;
    }

    return vars;
  }

  private getSampleValue(entity: string, field: string): string {
    const samples: Record<string, Record<string, string>> = {
      organisatie: { naam: 'Voorbeeldbedrijf B.V.', email: 'info@voorbeeld.nl' },
      contact: { bedrijfsnaam: 'Klant B.V.', voornaam: 'Jan', achternaam: 'de Vries', email: 'jan@klant.nl' },
      offerte: { nummer: 'OFF-2026-001', onderwerp: 'Inspectie kantoorpand', totaal: '€ 1.250,00', vervalDatum: '28 maart 2026', url: 'https://voorbeeld.nl/offerte/123' },
      afspraak: { datum: 'maandag 3 maart 2026', tijd: '10:00', duur: '2 uur', locatie: 'Hoofdstraat 1, Amsterdam', product: 'Jaarlijkse inspectie', url: 'https://voorbeeld.nl/afspraak/456' },
      gebruiker: { voornaam: 'Pieter', achternaam: 'Bakker', email: 'pieter@voorbeeld.nl' },
      uitnodiging: { rol: 'Manager', url: 'https://voorbeeld.nl/invite/abc' },
      notificatie: { titel: 'Nieuwe taak toegewezen', bericht: 'U heeft een nieuwe taak ontvangen.' },
      wachtwoord: { url: 'https://voorbeeld.nl/reset/xyz' },
    };
    return samples[entity]?.[field] ?? `[${entity}.${field}]`;
  }
}
