import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertSameOrg, assertFound, isSuperuser, isCrm } from '@/common';
import { AssignScheduleDto } from './dto';
import { AvailabilityNotifier } from './availability-notifier.service';

const assignmentInclude = {
  template: { select: { id: true, name: true, isActive: true, isDeleted: true } },
} satisfies Prisma.UserScheduleAssignmentInclude;

@Injectable()
export class UserSchedulesService {
  constructor(
    private prisma: PrismaService,
    private notifier: AvailabilityNotifier,
  ) {}

  /** Actuele + historische toewijzingen van een inspecteur (nieuwste eerst). */
  async getSchedule(userId: string, actor: User) {
    await this.assertUserInScope(userId, actor);
    // Planners (CRM/management) mogen elk schema inzien; een INSPECTEUR alleen het eigen.
    if (!isCrm(actor) && userId !== actor.id) {
      throw new ForbiddenException('U mag alleen uw eigen weekschema inzien');
    }

    return this.prisma.userScheduleAssignment.findMany({
      where: { userId },
      include: assignmentInclude,
      orderBy: { validFrom: 'desc' },
    });
  }

  /**
   * Wijs een template toe vanaf `validFrom`. De lopende (doorlopende) toewijzing
   * wordt op die datum afgesloten. Alles binnen één transactie.
   */
  async assign(userId: string, actor: User, dto: AssignScheduleDto) {
    const target = await this.assertUserInScope(userId, actor);
    await assertSameOrg(this.prisma.availabilityTemplate, dto.templateId, actor.orgId, 'Template');

    // De template moet bij de organisatie van de doelgebruiker horen (niet die van de actor;
    // een SUPERUSER heeft zelf geen org). Een verwijderde template mag niet toegewezen worden.
    const template = assertFound(
      await this.prisma.availabilityTemplate.findUnique({
        where: { id: dto.templateId },
        select: { id: true, orgId: true, isDeleted: true },
      }),
      'Template',
    );
    if (template.isDeleted || template.orgId !== target.orgId) {
      throw new NotFoundException('Template niet gevonden');
    }

    const validFrom = this.toDateOnly(dto.validFrom);

    const open = await this.prisma.userScheduleAssignment.findFirst({
      where: { userId, validUntil: null },
      orderBy: { validFrom: 'desc' },
    });
    if (open && open.validFrom >= validFrom) {
      throw new BadRequestException(
        'Ingangsdatum moet na de ingangsdatum van de lopende toewijzing liggen',
      );
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [];
    if (open) {
      ops.push(
        this.prisma.userScheduleAssignment.update({
          where: { id: open.id },
          data: { validUntil: validFrom },
        }),
      );
    }
    const createIndex = ops.length;
    ops.push(
      this.prisma.userScheduleAssignment.create({
        data: {
          orgId: target.orgId!,
          userId,
          templateId: dto.templateId,
          validFrom,
          validUntil: null,
          createdById: actor.id,
        },
        include: assignmentInclude,
      }),
    );

    const results = await this.prisma.$transaction(ops);

    this.notifier.managerChangedForUser(
      actor,
      userId,
      target.orgId,
      `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim() +
        ' heeft jouw weekschema gewijzigd.',
    );
    return results[createIndex];
  }

  /**
   * Verwijder een toekomstige toewijzing (validFrom > nu). Een voorganger die op
   * deze ingangsdatum werd afgesloten loopt daarna door tot de eerstvolgende
   * overgebleven toewijzing (of onbeperkt als die er niet is).
   */
  async remove(userId: string, assignmentId: string, actor: User) {
    const target = await this.assertUserInScope(userId, actor);

    const assignment = await this.prisma.userScheduleAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (!assignment || assignment.userId !== userId) {
      throw new NotFoundException('Toewijzing niet gevonden');
    }
    if (!isSuperuser(actor) && assignment.orgId !== actor.orgId) {
      throw new NotFoundException('Toewijzing niet gevonden');
    }

    if (assignment.validFrom <= this.startOfToday()) {
      throw new BadRequestException(
        'Alleen toekomstige toewijzingen kunnen worden verwijderd',
      );
    }

    // Keten-herstel: de voorganger moet doorlopen tot de eerstvolgende
    // overgebleven toewijzing — niet blind naar null, anders ontstaan er bij
    // gestapelde toekomstige toewijzingen twee open assignments naast elkaar.
    const successor = await this.prisma.userScheduleAssignment.findFirst({
      where: {
        userId,
        orgId: assignment.orgId,
        validFrom: { gt: assignment.validFrom },
        NOT: { id: assignmentId },
      },
      orderBy: { validFrom: 'asc' },
      select: { validFrom: true },
    });

    await this.prisma.$transaction([
      this.prisma.userScheduleAssignment.delete({ where: { id: assignmentId } }),
      this.prisma.userScheduleAssignment.updateMany({
        where: { userId, validUntil: assignment.validFrom },
        data: { validUntil: successor?.validFrom ?? null },
      }),
    ]);

    this.notifier.managerChangedForUser(
      actor,
      userId,
      target.orgId,
      `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim() +
        ' heeft een schema-toewijzing uit jouw rooster verwijderd.',
    );
  }

  // ─── Helpers ────────────────────────────────────────────

  /** Doelgebruiker moet bestaan en (voor niet-superusers) bij de org van de actor horen. */
  private async assertUserInScope(userId: string, actor: User) {
    const target = assertFound(
      await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, orgId: true },
      }),
      'Gebruiker',
    );
    if (!isSuperuser(actor) && target.orgId !== actor.orgId) {
      throw new NotFoundException('Gebruiker niet gevonden');
    }
    return target;
  }

  /** 'YYYY-MM-DD' → Date op UTC-middernacht (past bij de @db.Date-kolom). */
  private toDateOnly(input: string): Date {
    const d = new Date(input);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }

  private startOfToday(): Date {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
}
