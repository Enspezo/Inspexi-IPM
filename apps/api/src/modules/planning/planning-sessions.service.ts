import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import {
  User,
  PlanningStatus,
  AcceptanceStatus,
  NotificationType,
  SessionStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound, assertAllSameOrg } from '@/common';
import { NotificationsService } from '../notifications/notifications.service';
import { PlanningEmailService } from './planning-email.service';
import { PlanningService } from './planning.service';
import {
  CreateSessionDto,
  UpdateSessionDto,
  AssignSessionInspectorsDto,
  RejectSessionDto,
  RescheduleSessionDto,
} from './dto';

@Injectable()
export class PlanningSessionsService {
  private readonly logger = new Logger(PlanningSessionsService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private planningEmail: PlanningEmailService,
    private planning: PlanningService,
  ) {}

  // ─── Sessions ──────────────────────────────────────────────

  private async findSession(planningItemId: string, sessionId: string) {
    const session = assertFound(
      await this.prisma.planningSession.findUnique({
        where: { id: sessionId },
        include: {
          sessionInspectors: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, email: true, color: true, initials: true } },
            },
          },
        },
      }),
      'Sessie',
    );
    if (session.planningItemId !== planningItemId) throw new NotFoundException('Sessie niet gevonden');
    return session;
  }

  async findSessions(id: string, user: User) {
    await this.planning.findOne(id, user);
    return this.prisma.planningSession.findMany({
      where: { planningItemId: id },
      include: {
        sessionInspectors: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, email: true, color: true, initials: true } },
          },
          orderBy: [{ isPrimary: 'desc' }],
        },
      },
      orderBy: { sessionNumber: 'asc' },
    });
  }

  async addSession(id: string, dto: CreateSessionDto, user: User) {
    const item = await this.planning.findOne(id, user);
    if (!item.isMultiDay) {
      throw new BadRequestException('Kan alleen sessies toevoegen aan meerdaagse planregels');
    }

    // Determine next session number
    const sessions = await this.prisma.planningSession.findMany({
      where: { planningItemId: id },
      orderBy: { sessionNumber: 'desc' },
    });
    const nextNumber = (sessions[0]?.sessionNumber ?? 0) + 1;

    // Update sessionCount on parent
    await this.prisma.planningItem.update({
      where: { id },
      data: { sessionCount: nextNumber },
    });

    const session = await this.prisma.planningSession.create({
      data: {
        planningItemId: id,
        sessionNumber: nextNumber,
        scheduledDate: dto.scheduledDate ? new Date(dto.scheduledDate) : null,
        durationHours: dto.durationHours ?? null,
        notes: dto.notes ?? null,
        status: SessionStatus.NOG_TE_PLANNEN,
      },
    });

    await this.planning.addHistoryEntry(id, user.id, 'SESSIE_TOEGEVOEGD', `Sessie ${nextNumber} toegevoegd`);
    return session;
  }

  async updateSession(id: string, sessionId: string, dto: UpdateSessionDto, user: User) {
    const item = await this.planning.findOne(id, user);
    const session = await this.findSession(id, sessionId);
    if (session.status === SessionStatus.DEFINITIEF || session.status === SessionStatus.AFGEROND) {
      throw new BadRequestException('Definitieve sessies kunnen niet meer worden gewijzigd');
    }

    const newScheduledDate =
      dto.scheduledDate !== undefined ? (dto.scheduledDate ? new Date(dto.scheduledDate) : null) : undefined;
    const newDurationHours = dto.durationHours !== undefined ? dto.durationHours : undefined;

    // PRD-12 §12.9: verzetten van een sessie met toegewezen inspecteurs →
    // beschikbaarheid opnieuw beoordelen (409 met warnings, tenzij override).
    let overrideWarnings: Awaited<ReturnType<typeof this.planning.assertInspectorAvailability>> = [];
    if (newScheduledDate instanceof Date) {
      const inspectorIds = (session.sessionInspectors as { userId: string | null }[])
        .map((si) => si.userId)
        .filter((uid): uid is string => !!uid);
      overrideWarnings = await this.planning.assertInspectorAvailability(
        newScheduledDate,
        (newDurationHours ?? session.durationHours) ?? item.durationHours,
        inspectorIds,
        dto.overrideAvailabilityWarnings,
      );
    }

    const updated = await this.prisma.planningSession.update({
      where: { id: sessionId },
      data: {
        scheduledDate: newScheduledDate,
        durationHours: newDurationHours,
        notes: dto.notes !== undefined ? dto.notes : undefined,
      },
    });

    await this.planning.addHistoryEntry(id, user.id, 'SESSIE_BIJGEWERKT', `Sessie ${session.sessionNumber} bijgewerkt`);
    await this.planning.logAvailabilityOverride(
      id,
      user.id,
      overrideWarnings,
      `Beschikbaarheidswaarschuwing genegeerd bij verzetten (sessie ${session.sessionNumber})`,
    );
    return updated;
  }

  async cancelSession(id: string, sessionId: string, user: User) {
    await this.planning.findOne(id, user);
    const session = await this.findSession(id, sessionId);
    if (session.status === SessionStatus.DEFINITIEF || session.status === SessionStatus.AFGEROND) {
      throw new BadRequestException('Definitieve sessies kunnen niet worden geannuleerd');
    }

    await this.prisma.planningSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.VERVALLEN, isCancelled: true },
    });

    await this.planning.addHistoryEntry(id, user.id, 'SESSIE_GEANNULEERD', `Sessie ${session.sessionNumber} geannuleerd`);

    // Check if all remaining sessions are definitief → parent GEPLAND
    await this.checkAllSessionsDefinitief(id);
  }

  async assignSessionInspectors(id: string, sessionId: string, dto: AssignSessionInspectorsDto, user: User) {
    const item = await this.planning.findOne(id, user);
    if (!item.isMultiDay) {
      throw new BadRequestException('Gebruik /assign voor enkeldaagse planregels');
    }
    const session = await this.findSession(id, sessionId);
    if (session.status === SessionStatus.DEFINITIEF || session.status === SessionStatus.AFGEROND) {
      throw new BadRequestException('Kan geen inspecteurs toewijzen aan een definitieve sessie');
    }

    // Inspectors must belong to the same organization as the planning item.
    await assertAllSameOrg(this.prisma.user, dto.inspectorIds, item.orgId, 'inspecteurs');

    // PRD-12 §12.9: beschikbaarheids-soft-check op de sessiedatum (409 met
    // warnings, tenzij override). Duur valt terug op de parent-duur.
    const overrideWarnings = await this.planning.assertInspectorAvailability(
      session.scheduledDate,
      session.durationHours ?? item.durationHours,
      dto.inspectorIds,
      dto.overrideAvailabilityWarnings,
    );

    // Remove PENDING session inspectors for this session
    await this.prisma.planningSessionInspector.deleteMany({
      where: { sessionId, acceptanceStatus: AcceptanceStatus.PENDING },
    });

    for (const inspectorId of dto.inspectorIds) {
      await this.prisma.planningSessionInspector.upsert({
        where: { sessionId_userId: { sessionId, userId: inspectorId } },
        create: {
          sessionId,
          userId: inspectorId,
          isPrimary: inspectorId === (dto.primaryInspectorId ?? dto.inspectorIds[0]),
          acceptanceStatus: AcceptanceStatus.PENDING,
        },
        update: {
          isPrimary: inspectorId === (dto.primaryInspectorId ?? dto.inspectorIds[0]),
          acceptanceStatus: AcceptanceStatus.PENDING,
          acceptedAt: null,
          rejectedAt: null,
          rejectionNote: null,
        },
      });

      // Also ensure PlanningInspector exists on parent item
      await this.prisma.planningInspector.upsert({
        where: { planningItemId_userId: { planningItemId: id, userId: inspectorId } },
        create: {
          planningItemId: id,
          userId: inspectorId,
          isPrimary: inspectorId === (dto.primaryInspectorId ?? dto.inspectorIds[0]),
        },
        update: {
          isPrimary: inspectorId === (dto.primaryInspectorId ?? dto.inspectorIds[0]),
        },
      });
    }

    // Advance session to CONCEPT
    await this.prisma.planningSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.CONCEPT },
    });

    // Advance parent item to CONCEPT if still NOG_TE_PLANNEN
    if (item.status === PlanningStatus.NOG_TE_PLANNEN) {
      await this.prisma.planningItem.update({
        where: { id },
        data: { status: PlanningStatus.CONCEPT },
      });
    }

    await this.planning.addHistoryEntry(
      id,
      user.id,
      'SESSIE_INSPECTEURS_TOEGEWEZEN',
      `Sessie ${session.sessionNumber}: ${dto.inspectorIds.length} inspecteur(s) toegewezen`,
    );

    await this.planning.logAvailabilityOverride(
      id,
      user.id,
      overrideWarnings,
      `Beschikbaarheidswaarschuwing genegeerd (sessie ${session.sessionNumber})`,
    );

    // Notify inspectors (excluding actor)
    const toNotify = dto.inspectorIds.filter((iid) => iid !== user.id);
    if (toNotify.length > 0 && item.orgId) {
      this.notifications.dispatch({
        type: NotificationType.AFSPRAAK_ACCEPTATIE_VERZOEK,
        orgId: item.orgId,
        recipientUserIds: toNotify,
        title: 'Afspraak acceptatie verzoek',
        body: `U bent toegewezen aan sessie ${session.sessionNumber} van afspraak "${item.productName}". Graag uw acceptatie.`,
        entityType: 'planningItem',
        entityId: id,
      });

      const inspectors = await this.prisma.user.findMany({
        where: { id: { in: toNotify } },
        select: { email: true, firstName: true, lastName: true },
      });
      const org = await this.prisma.organization.findUnique({
        where: { id: item.orgId },
        select: { name: true },
      });
      for (const inspector of inspectors) {
        this.planningEmail
          .sendAcceptationRequest({
            to: inspector.email,
            recipientName: `${inspector.firstName} ${inspector.lastName}`,
            productName: item.productName,
            scheduledDate: session.scheduledDate,
            orgName: org?.name ?? 'InspeXi',
            sessionLabel: `Sessie ${session.sessionNumber}/${item.sessionCount ?? '?'}`,
            orgId: item.orgId,
          })
          .catch((err) => this.logger.error('Session acceptation email failed', err));
      }
    }

    return this.findSession(id, sessionId);
  }

  async acceptSession(id: string, sessionId: string, user: User) {
    await this.planning.findOne(id, user);
    const session = await this.findSession(id, sessionId);

    const si = await this.prisma.planningSessionInspector.findUnique({
      where: { sessionId_userId: { sessionId, userId: user.id } },
    });
    if (!si) throw new ForbiddenException('U bent niet toegewezen aan deze sessie');
    if (si.acceptanceStatus !== AcceptanceStatus.PENDING) {
      throw new BadRequestException('U heeft al gereageerd op deze sessie');
    }

    await this.prisma.planningSessionInspector.update({
      where: { sessionId_userId: { sessionId, userId: user.id } },
      data: { acceptanceStatus: AcceptanceStatus.ACCEPTED, acceptedAt: new Date() },
    });

    const item = await this.prisma.planningItem.findUnique({
      where: { id },
      select: { orgId: true, createdBy: true, productName: true },
    });

    if (item && item.createdBy !== user.id) {
      this.notifications.dispatch({
        type: NotificationType.AFSPRAAK_GEACCEPTEERD,
        orgId: item.orgId,
        recipientUserIds: [item.createdBy],
        title: 'Sessie geaccepteerd',
        body: `${user.firstName} ${user.lastName} heeft sessie ${session.sessionNumber} van "${item.productName}" geaccepteerd.`,
        entityType: 'planningItem',
        entityId: id,
      });
    }

    await this.planning.addHistoryEntry(
      id,
      user.id,
      'SESSIE_GEACCEPTEERD',
      `Sessie ${session.sessionNumber}: geaccepteerd door ${user.firstName} ${user.lastName}`,
    );

    await this.checkSessionAllAccepted(id, sessionId);
  }

  async rejectSession(id: string, sessionId: string, dto: RejectSessionDto, user: User) {
    await this.planning.findOne(id, user);
    const session = await this.findSession(id, sessionId);

    const si = await this.prisma.planningSessionInspector.findUnique({
      where: { sessionId_userId: { sessionId, userId: user.id } },
    });
    if (!si) throw new ForbiddenException('U bent niet toegewezen aan deze sessie');
    if (si.acceptanceStatus !== AcceptanceStatus.PENDING) {
      throw new BadRequestException('U heeft al gereageerd op deze sessie');
    }

    await this.prisma.planningSessionInspector.update({
      where: { sessionId_userId: { sessionId, userId: user.id } },
      data: { acceptanceStatus: AcceptanceStatus.REJECTED, rejectedAt: new Date(), rejectionNote: dto.reason },
    });

    const item = await this.prisma.planningItem.findUnique({
      where: { id },
      select: { orgId: true, createdBy: true, productName: true },
    });

    if (item && item.createdBy !== user.id) {
      this.notifications.dispatch({
        type: NotificationType.AFSPRAAK_GEWEIGERD,
        orgId: item.orgId,
        recipientUserIds: [item.createdBy],
        title: 'Sessie geweigerd',
        body: `${user.firstName} ${user.lastName} heeft sessie ${session.sessionNumber} van "${item.productName}" geweigerd. Reden: ${dto.reason}`,
        entityType: 'planningItem',
        entityId: id,
      });
    }

    await this.planning.addHistoryEntry(
      id,
      user.id,
      'SESSIE_GEWEIGERD',
      `Sessie ${session.sessionNumber}: geweigerd door ${user.firstName} ${user.lastName}. Reden: ${dto.reason}`,
    );
  }

  async confirmSession(id: string, sessionId: string, user: User) {
    await this.planning.findOne(id, user);
    const session = await this.findSession(id, sessionId);
    if (session.status === SessionStatus.DEFINITIEF) {
      throw new BadRequestException('Sessie is al definitief');
    }
    if (!session.scheduledDate) {
      throw new BadRequestException('Stel eerst een datum in voor deze sessie');
    }

    await this.prisma.planningSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.DEFINITIEF, isDefinitief: true, confirmedAt: new Date(), confirmedBy: user.id },
    });

    await this.planning.addHistoryEntry(
      id,
      user.id,
      'SESSIE_DEFINITIEF',
      `Sessie ${session.sessionNumber} handmatig bevestigd als definitief`,
    );

    // Send confirmation email for this session
    await this.doSendSessionConfirmationEmailsById(id, sessionId);

    // Check if all sessions DEFINITIEF → parent GEPLAND
    await this.checkAllSessionsDefinitief(id);
  }

  async rescheduleSession(id: string, sessionId: string, dto: RescheduleSessionDto, user: User) {
    const item = await this.planning.findOne(id, user);
    const session = await this.findSession(id, sessionId);

    // Mark old session VERVALLEN
    await this.prisma.planningSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.VERVALLEN, isCancelled: true },
    });

    // Create new session with same sessionNumber
    const newSession = await this.prisma.planningSession.create({
      data: {
        planningItemId: id,
        sessionNumber: session.sessionNumber,
        status: SessionStatus.NOG_TE_PLANNEN,
        durationHours: session.durationHours,
        replacesId: sessionId,
        originalDate: session.scheduledDate,
      },
    });

    // Link back
    await this.prisma.planningSession.update({
      where: { id: sessionId },
      data: { replacedById: newSession.id },
    });

    await this.planning.addHistoryEntry(
      id,
      user.id,
      'SESSIE_VERPLAATST',
      `Sessie ${session.sessionNumber} verplaatst. Reden: ${dto.reason}`,
    );

    // Send reschedule emails to contact + followers
    const fullItem = await this.prisma.planningItem.findUnique({
      where: { id },
      include: {
        contact: { select: { email: true, companyName: true, firstName: true, lastName: true } },
        followers: { include: { user: { select: { email: true, firstName: true } } } },
        organization: { select: { name: true } },
      },
    });
    if (fullItem) {
      this.doSendSessionRescheduleEmails(fullItem, session, dto.reason).catch((err) =>
        this.logger.error('Failed to send session reschedule emails', err),
      );
    }

    return newSession;
  }

  async completeSession(id: string, sessionId: string, user: User) {
    await this.planning.findOne(id, user);
    const session = await this.findSession(id, sessionId);

    await this.prisma.planningSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.AFGEROND },
    });

    await this.planning.addHistoryEntry(id, user.id, 'SESSIE_AFGEROND', `Sessie ${session.sessionNumber} afgerond`);

    // If all non-cancelled sessions are AFGEROND → parent AFGEROND
    const sessions = await this.prisma.planningSession.findMany({
      where: { planningItemId: id, isCancelled: false },
    });
    if (sessions.length > 0 && sessions.every((s) => s.status === SessionStatus.AFGEROND)) {
      await this.prisma.planningItem.update({
        where: { id },
        data: { status: PlanningStatus.AFGEROND },
      });
      await this.planning.addHistoryEntry(id, null, 'AFGEROND', 'Alle sessies afgerond — planregel afgerond');
    }
  }

  // ─── Session private helpers ───────────────────────────────

  private async checkSessionAllAccepted(planningItemId: string, sessionId: string) {
    const inspectors = await this.prisma.planningSessionInspector.findMany({
      where: { sessionId },
    });
    if (inspectors.length === 0) return;
    if (!inspectors.every((i) => i.acceptanceStatus === AcceptanceStatus.ACCEPTED)) return;

    // All accepted → DEFINITIEF (only if a date has been set)
    const session = await this.prisma.planningSession.findUnique({
      where: { id: sessionId },
      select: { sessionNumber: true, scheduledDate: true },
    });
    if (!session?.scheduledDate) {
      // All inspectors accepted but no date yet — stay at CONCEPT until date is set
      return;
    }
    await this.prisma.planningSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.DEFINITIEF, isDefinitief: true, confirmedAt: new Date() },
    });

    await this.planning.addHistoryEntry(
      planningItemId,
      null,
      'SESSIE_DEFINITIEF',
      `Sessie ${session?.sessionNumber} is definitief — alle inspecteurs geaccepteerd`,
    );

    // Send session confirmation email
    await this.doSendSessionConfirmationEmailsById(planningItemId, sessionId);

    // Check if all sessions DEFINITIEF → parent GEPLAND
    await this.checkAllSessionsDefinitief(planningItemId);
  }

  private async checkAllSessionsDefinitief(planningItemId: string) {
    const sessions = await this.prisma.planningSession.findMany({
      where: { planningItemId, isCancelled: false },
    });
    if (sessions.length === 0) return;
    if (!sessions.every((s) => s.status === SessionStatus.DEFINITIEF || s.status === SessionStatus.AFGEROND)) return;

    const item = await this.prisma.planningItem.findUnique({
      where: { id: planningItemId },
      select: { status: true, orgId: true, createdBy: true, productName: true },
    });
    if (!item || item.status === PlanningStatus.GEPLAND || item.status === PlanningStatus.AFGEROND) return;

    await this.prisma.planningItem.update({
      where: { id: planningItemId },
      data: { status: PlanningStatus.GEPLAND },
    });

    await this.planning.addHistoryEntry(
      planningItemId,
      null,
      'GEPLAND',
      'Alle sessies definitief — planregel bevestigd',
    );

    this.notifications.dispatch({
      type: NotificationType.AFSPRAAK_BEVESTIGING_VERSTUURD,
      orgId: item.orgId,
      recipientUserIds: [item.createdBy],
      title: 'Alle sessies bevestigd',
      body: `Alle sessies van "${item.productName}" zijn definitief.`,
      entityType: 'planningItem',
      entityId: planningItemId,
    });
  }

  private async doSendSessionConfirmationEmailsById(planningItemId: string, sessionId: string) {
    const item = await this.prisma.planningItem.findUnique({
      where: { id: planningItemId },
      include: {
        contact: { select: { email: true, companyName: true, firstName: true, lastName: true } },
        location: { select: { name: true, street: true, houseNumber: true, city: true } },
        followers: { include: { user: { select: { email: true, firstName: true } } } },
        organization: { select: { name: true } },
      },
    });
    const session = await this.prisma.planningSession.findUnique({ where: { id: sessionId } });
    if (!item || !session) return;

    const portalUrl = this.planning.getPublicUrl(`/afspraak/${item.publicToken}`);
    const locationName = item.location
      ? [item.location.street, item.location.houseNumber, item.location.city].filter(Boolean).join(' ')
      : undefined;

    const recipients = this.planning.collectEmailRecipients(item);
    for (const r of recipients) {
      this.planningEmail
        .sendSessionConfirmation({
          to: r.email,
          recipientName: r.name,
          productName: item.productName,
          sessionNumber: session.sessionNumber,
          totalSessions: item.sessionCount ?? 1,
          scheduledDate: session.scheduledDate,
          durationHours: session.durationHours,
          locationName,
          orgName: item.organization?.name ?? 'InspeXi',
          portalUrl,
          orgId: item.orgId,
        })
        .catch((err) => this.logger.error('Session confirmation email failed', err));
    }
  }

  private async doSendSessionRescheduleEmails(item: any, session: any, reason: string) {
    const recipients = this.planning.collectEmailRecipients(item);
    for (const r of recipients) {
      await this.planningEmail.sendRescheduleNotification({
        to: r.email,
        recipientName: r.name,
        productName: `${item.productName} (sessie ${session.sessionNumber})`,
        reason,
        orgName: item.organization?.name ?? 'InspeXi',
        newPortalUrl: this.planning.getPublicUrl(`/afspraak/${item.publicToken}`),
        orgId: item.orgId,
      });
    }
  }
}
