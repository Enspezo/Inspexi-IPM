// Event-dispatch van de herstel-flow (PRD-14 §14.8). In fase 2 waren dit no-ops;
// fase 3 vult de notificaties (HERSTEL_CONFLICT, HERINSPECTIE_VOORSTEL,
// HERSTEL_AFGEROND) en de directe e-mails in. Alle hooks worden fire-and-forget
// aangeroepen: een falende dispatch mag de klant-flow nooit laten falen.
//
// PM-resolutie (PRD §14.3 besluit 7): Project.projectManagerId → plan.reviewerId
// → plan.assignedTo; geen van drie → alleen Logger.warn, geen notificatie.

import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import type { FindingResolution, RepairSession } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { RESOLUTION_REPORTED } from '@/common';
import { NotificationsService } from '../notifications/notifications.service';
import { RepairEmailService } from './repair-email.service';
import { resolveProjectManager } from './resolve-project-manager';

@Injectable()
export class RepairEventsService {
  private readonly logger = new Logger(RepairEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: RepairEmailService,
  ) {}

  private async loadPlanContext(planId: string) {
    return this.prisma.inspectionPlan.findUnique({
      where: { id: planId },
      select: {
        id: true,
        orgId: true,
        projectName: true,
        referenceNumber: true,
        reviewerId: true,
        assignedTo: true,
        project: { select: { projectManagerId: true } },
        contact: { select: { email: true, companyName: true, firstName: true, lastName: true } },
        organization: { select: { name: true } },
      },
    });
  }

  private contactEmailOrWarn(
    plan: { contact: { email: string | null } | null; referenceNumber: string | null },
    context: string,
  ): string | null {
    const email = plan.contact?.email ?? null;
    if (!email) {
      this.logger.warn(
        `Opdrachtgever zonder e-mailadres — ${context} overgeslagen (plan ${plan.referenceNumber ?? 'zonder rapportnummer'})`,
      );
    }
    return email;
  }

  /** Verklaring ondertekend: notificatie naar de PM + bevestiging-PDF per e-mail. */
  async onDeclarationSigned(
    session: RepairSession,
    pdf: { filename: string; content: Buffer },
  ): Promise<void> {
    const plan = await this.loadPlanContext(session.inspectionPlanId);
    if (!plan) return;

    const pm = resolveProjectManager(plan);
    if (pm) {
      this.notifications.dispatch({
        type: NotificationType.HERSTEL_AFGEROND,
        orgId: plan.orgId,
        recipientUserIds: [pm],
        title: 'Herstelverklaring ondertekend',
        body: `Voor inspectie "${plan.projectName}" is een herstelverklaring ondertekend door ${session.contactName ?? 'een externe partij'}.`,
        entityType: 'inspectionPlan',
        entityId: plan.id,
      });
    } else {
      this.logger.warn(`Geen projectmanager gevonden voor plan ${plan.id} — HERSTEL_AFGEROND overgeslagen`);
    }

    const orgName = plan.organization.name;
    // Invuller (sessie-e-mail of clientUser-e-mail) — bij CLIENT_USER is session.email vooraf gevuld.
    if (session.email) {
      await this.email.sendDeclarationConfirmation({
        to: session.email,
        recipientName: session.contactName,
        orgName,
        referenceNumber: plan.referenceNumber,
        projectName: plan.projectName,
        attachment: pdf,
      });
    }
    // Opdrachtgever (Contact.email van plan.contactId; leeg → overslaan + warn).
    const contactEmail = this.contactEmailOrWarn(plan, 'bevestiging herstelverklaring');
    if (contactEmail && contactEmail !== session.email) {
      const c = plan.contact!;
      await this.email.sendDeclarationConfirmation({
        to: contactEmail,
        recipientName: c.companyName ?? ([c.firstName, c.lastName].filter(Boolean).join(' ') || null),
        orgName,
        referenceNumber: plan.referenceNumber,
        projectName: plan.projectName,
        attachment: pdf,
      });
    }
  }

  /** Verloren race: een tweede partij meldde herstel op een al geclaimde constatering. */
  async onRepairConflict(
    session: RepairSession,
    findingId: string,
    conflictResolution: FindingResolution,
  ): Promise<void> {
    const [plan, finding, winner, loserPhotoCount] = await Promise.all([
      this.loadPlanContext(session.inspectionPlanId),
      this.prisma.finding.findUnique({
        where: { id: findingId },
        select: { shortDescription: true },
      }),
      this.prisma.findingResolution.findFirst({
        where: { findingId, statusCode: RESOLUTION_REPORTED },
        orderBy: { resolvedAt: 'asc' },
        select: { description: true, _count: { select: { photos: true } } },
      }),
      this.prisma.findingResolutionPhoto.count({
        where: { resolutionId: conflictResolution.id },
      }),
    ]);
    if (!plan || !finding) return;

    const pm = resolveProjectManager(plan);
    if (pm) {
      this.notifications.dispatch({
        type: NotificationType.HERSTEL_CONFLICT,
        orgId: plan.orgId,
        recipientUserIds: [pm],
        title: 'Dubbele herstelmelding',
        body: `Constatering "${finding.shortDescription}" van inspectie "${plan.projectName}" kreeg een tweede herstelmelding; deze is bewaard maar niet doorgevoerd.`,
        entityType: 'inspectionPlan',
        entityId: plan.id,
      });
    } else {
      this.logger.warn(`Geen projectmanager gevonden voor plan ${plan.id} — HERSTEL_CONFLICT overgeslagen`);
    }

    const winnerBlock = {
      description: winner?.description ?? null,
      photoCount: winner?._count.photos ?? 0,
    };
    const loserBlock = {
      description: conflictResolution.description,
      photoCount: loserPhotoCount,
    };
    const params = {
      orgName: plan.organization.name,
      referenceNumber: plan.referenceNumber,
      projectName: plan.projectName,
      findingDescription: finding.shortDescription,
      winner: winnerBlock,
      loser: loserBlock,
    };

    const contactEmail = this.contactEmailOrWarn(plan, 'conflictmelding');
    if (contactEmail) {
      await this.email.sendConflictNotice({ to: contactEmail, ...params });
    }
    // PM óók per directe e-mail (PRD §14.8): alleen wanneer die een e-mailadres heeft.
    if (pm) {
      const pmUser = await this.prisma.user.findUnique({
        where: { id: pm },
        select: { email: true },
      });
      if (pmUser?.email && pmUser.email !== contactEmail) {
        await this.email.sendConflictNotice({ to: pmUser.email, ...params });
      }
    }
  }

  /** Laatste openstaande kritieke constatering van het plan is hersteld gemeld. */
  async onAllCriticalRepaired(planId: string, orgId: string): Promise<void> {
    const plan = await this.loadPlanContext(planId);
    if (!plan || plan.orgId !== orgId) return;

    const pm = resolveProjectManager(plan);
    if (pm) {
      this.notifications.dispatch({
        type: NotificationType.HERINSPECTIE_VOORSTEL,
        orgId: plan.orgId,
        recipientUserIds: [pm],
        title: 'Alle kritieke constateringen hersteld gemeld',
        body: `Alle kritieke constateringen van inspectie "${plan.projectName}" zijn hersteld gemeld — administratieve herinspectie inplannen?`,
        entityType: 'inspectionPlan',
        entityId: plan.id,
      });
    } else {
      this.logger.warn(`Geen projectmanager gevonden voor plan ${plan.id} — HERINSPECTIE_VOORSTEL overgeslagen`);
    }

    const contactEmail = this.contactEmailOrWarn(plan, 'herinspectie-voorstel');
    if (contactEmail) {
      await this.email.sendReinspectionProposal({
        to: contactEmail,
        orgName: plan.organization.name,
        referenceNumber: plan.referenceNumber,
        projectName: plan.projectName,
      });
    }
  }
}
