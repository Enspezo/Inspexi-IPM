import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  User,
  Role,
  QuoteStatus,
  ApprovalKind,
  ApprovalStatus,
  NotificationType,
} from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound, assertSameOrg } from '@/common';
import { NotificationsService } from '../notifications/notifications.service';
import {
  SubmitApprovalDto,
  ApproveQuoteDto,
  RejectQuoteDto,
  RequestTeamApprovalDto,
  RequestPersonApprovalDto,
  ReviewVoluntaryApprovalDto,
} from './dto';
import {
  assertTemplateLinked,
  findQuoteForUser,
  isQuoteApprovalRequired,
} from './quotes.helpers';

/** Fallback-doelgroep voor verplichte goedkeuring zonder geconfigureerde rol. */
const MANDATORY_FALLBACK_ROLES: Role[] = [Role.MANAGER, Role.ORG_ADMIN];

@Injectable()
export class QuoteApprovalsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── Mandatory flow (threshold / template) ────────────────────────────

  async submitForApproval(id: string, dto: SubmitApprovalDto, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    if (quote.status !== QuoteStatus.CONCEPT)
      throw new BadRequestException(
        'Alleen offertes met status CONCEPT kunnen ter goedkeuring worden ingediend',
      );
    // CONCEPT → TER_GOEDKEURING leaves CONCEPT — a template must be linked.
    assertTemplateLinked(quote);

    const org = await this.getApprovalConfig(quote.orgId);
    if (!isQuoteApprovalRequired(org, quote))
      throw new BadRequestException('Deze offerte vereist geen goedkeuring');

    const approverRole = org.quoteApprovalRequiredRole ?? null;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.quoteApprovalRequest.create({
        data: {
          quoteId: quote.id,
          requestedBy: user.id,
          kind: ApprovalKind.THRESHOLD,
          approverRole,
          note: dto.note || undefined,
        },
      });
      return tx.quote.update({
        where: { id: quote.id },
        data: { status: QuoteStatus.TER_GOEDKEURING },
      });
    });

    const targetRoles = approverRole ? [approverRole] : MANDATORY_FALLBACK_ROLES;
    const recipients = await this.usersWithRoles(quote.orgId, targetRoles, user.id);
    this.notifications.dispatch({
      type: NotificationType.OFFERTE_TER_GOEDKEURING,
      orgId: quote.orgId,
      recipientUserIds: recipients,
      title: 'Offerte ter goedkeuring',
      body: `Offerte ${quote.quoteNumber} staat klaar voor uw goedkeuring.`,
      entityType: 'quote',
      entityId: quote.id,
    });
    return updated;
  }

  async approve(id: string, dto: ApproveQuoteDto, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    if (quote.status !== QuoteStatus.TER_GOEDKEURING)
      throw new BadRequestException(
        'Alleen offertes met status TER_GOEDKEURING kunnen goedgekeurd worden',
      );

    const pending = await this.prisma.quoteApprovalRequest.findFirst({
      where: {
        quoteId: quote.id,
        kind: ApprovalKind.THRESHOLD,
        status: ApprovalStatus.PENDING,
      },
      orderBy: { requestedAt: 'desc' },
    });
    this.assertIsApprover(user, pending);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (pending)
        await tx.quoteApprovalRequest.update({
          where: { id: pending.id },
          data: {
            status: ApprovalStatus.APPROVED,
            reviewedBy: user.id,
            reviewedAt: new Date(),
            note: dto.note || pending.note,
          },
        });
      return tx.quote.update({
        where: { id: quote.id },
        data: {
          status: QuoteStatus.GOEDGEKEURD,
          managerSignature: dto.managerSignature || null,
        },
      });
    });
    this.notifications.dispatch({
      type: NotificationType.OFFERTE_GOEDGEKEURD,
      orgId: quote.orgId,
      recipientUserIds: [quote.createdBy],
      title: 'Offerte goedgekeurd',
      body: `Offerte ${quote.quoteNumber} is goedgekeurd.`,
      entityType: 'quote',
      entityId: quote.id,
    });
    return updated;
  }

  async reject(id: string, dto: RejectQuoteDto, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    if (quote.status !== QuoteStatus.TER_GOEDKEURING)
      throw new BadRequestException(
        'Alleen offertes met status TER_GOEDKEURING kunnen afgewezen worden',
      );

    const pending = await this.prisma.quoteApprovalRequest.findFirst({
      where: {
        quoteId: quote.id,
        kind: ApprovalKind.THRESHOLD,
        status: ApprovalStatus.PENDING,
      },
      orderBy: { requestedAt: 'desc' },
    });
    this.assertIsApprover(user, pending);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (pending)
        await tx.quoteApprovalRequest.update({
          where: { id: pending.id },
          data: {
            status: ApprovalStatus.REJECTED,
            reviewedBy: user.id,
            reviewedAt: new Date(),
            note: dto.note,
          },
        });
      return tx.quote.update({
        where: { id: quote.id },
        data: { status: QuoteStatus.CONCEPT },
      });
    });
    this.notifications.dispatch({
      type: NotificationType.OFFERTE_AFGEWEZEN,
      orgId: quote.orgId,
      recipientUserIds: [quote.createdBy],
      title: 'Offerte afgewezen',
      body: `Offerte ${quote.quoteNumber} is afgewezen.`,
      entityType: 'quote',
      entityId: quote.id,
    });
    return updated;
  }

  // ─── Voluntary flows (advisory; never change status / block sending) ───

  async requestTeamApproval(id: string, dto: RequestTeamApprovalDto, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    const approverRole = this.resolveOwnTeam(user, dto.role);

    const request = await this.prisma.quoteApprovalRequest.create({
      data: {
        quoteId: quote.id,
        requestedBy: user.id,
        kind: ApprovalKind.VOLUNTARY_TEAM,
        approverRole,
        note: dto.note || undefined,
      },
    });

    const recipients = await this.usersWithRoles(quote.orgId, [approverRole], user.id);
    this.notifications.dispatch({
      type: NotificationType.OFFERTE_GOEDKEURING_GEVRAAGD_TEAM,
      orgId: quote.orgId,
      recipientUserIds: recipients,
      title: 'Goedkeuring gevraagd (team)',
      body: `${this.fullName(user)} vraagt teamgoedkeuring voor offerte ${quote.quoteNumber}.`,
      entityType: 'quote',
      entityId: quote.id,
    });
    return request;
  }

  async requestPersonApproval(id: string, dto: RequestPersonApprovalDto, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    if (dto.approverUserId === user.id)
      throw new BadRequestException('U kunt geen goedkeuring aan uzelf vragen');
    // Doelpersoon moet bij de eigen organisatie horen.
    await assertSameOrg(this.prisma.user, dto.approverUserId, quote.orgId, 'Goedkeurder');

    const request = await this.prisma.quoteApprovalRequest.create({
      data: {
        quoteId: quote.id,
        requestedBy: user.id,
        kind: ApprovalKind.VOLUNTARY_PERSON,
        approverUserId: dto.approverUserId,
        note: dto.note || undefined,
      },
    });

    this.notifications.dispatch({
      type: NotificationType.OFFERTE_GOEDKEURING_GEVRAAGD_PERSOON,
      orgId: quote.orgId,
      recipientUserIds: [dto.approverUserId],
      title: 'Goedkeuring gevraagd',
      body: `${this.fullName(user)} vraagt uw goedkeuring voor offerte ${quote.quoteNumber}.`,
      entityType: 'quote',
      entityId: quote.id,
    });
    return request;
  }

  /** Goedkeuren/afwijzen van een specifiek vrijwillig verzoek (geen statuswijziging). */
  async reviewVoluntary(
    id: string,
    requestId: string,
    approved: boolean,
    dto: ReviewVoluntaryApprovalDto,
    user: User,
  ) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    const request = await this.findVoluntaryRequest(quote.id, requestId);
    if (request.status !== ApprovalStatus.PENDING)
      throw new BadRequestException('Dit verzoek is al afgehandeld');
    this.assertIsApprover(user, request);

    const updated = await this.prisma.quoteApprovalRequest.update({
      where: { id: request.id },
      data: {
        status: approved ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        note: dto.note || request.note,
      },
    });

    this.notifications.dispatch({
      type: NotificationType.OFFERTE_GOEDKEURING_AFGEHANDELD,
      orgId: quote.orgId,
      recipientUserIds: [request.requestedBy],
      title: approved ? 'Goedkeuringsverzoek goedgekeurd' : 'Goedkeuringsverzoek afgewezen',
      body: `${this.fullName(user)} heeft uw goedkeuringsverzoek voor offerte ${quote.quoteNumber} ${approved ? 'goedgekeurd' : 'afgewezen'}.`,
      entityType: 'quote',
      entityId: quote.id,
    });
    return updated;
  }

  /** Aanvrager trekt een eigen vrijwillig verzoek in. */
  async cancelVoluntary(id: string, requestId: string, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    const request = await this.findVoluntaryRequest(quote.id, requestId);
    if (request.requestedBy !== user.id)
      throw new ForbiddenException('Alleen de aanvrager kan dit verzoek intrekken');
    if (request.status !== ApprovalStatus.PENDING)
      throw new BadRequestException('Alleen openstaande verzoeken kunnen ingetrokken worden');

    return this.prisma.quoteApprovalRequest.update({
      where: { id: request.id },
      data: { status: ApprovalStatus.CANCELLED },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async getApprovalConfig(orgId: string) {
    return assertFound(
      await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { quoteApprovalThreshold: true, quoteApprovalRequiredRole: true },
      }),
      'Organisatie',
    );
  }

  private async findVoluntaryRequest(quoteId: string, requestId: string) {
    const request = assertFound(
      await this.prisma.quoteApprovalRequest.findUnique({ where: { id: requestId } }),
      'Goedkeuringsverzoek',
    );
    if (request.quoteId !== quoteId)
      throw new BadRequestException('Verzoek hoort niet bij deze offerte');
    if (request.kind === ApprovalKind.THRESHOLD)
      throw new BadRequestException(
        'Verplichte goedkeuringsverzoeken worden via de goedkeur-/afwijs-actie afgehandeld',
      );
    return request;
  }

  /** Bepaalt het eigen team (rol) voor een vrijwillig teamverzoek. */
  private resolveOwnTeam(user: User, requested?: Role): Role {
    const staffRoles = user.roles.filter((r) => r !== Role.SUPERUSER);
    if (requested) {
      if (!user.roles.includes(requested))
        throw new BadRequestException('U kunt alleen goedkeuring vragen aan uw eigen team/rol');
      return requested;
    }
    if (staffRoles.length === 1) return staffRoles[0];
    if (staffRoles.length === 0)
      throw new BadRequestException('U heeft geen team om goedkeuring aan te vragen');
    throw new BadRequestException('Kies expliciet een team/rol om goedkeuring aan te vragen');
  }

  /**
   * Handhaaft dat `user` de doelgroep van een verzoek is:
   *  - VOLUNTARY_PERSON → exact die persoon;
   *  - rol-gericht (THRESHOLD/VOLUNTARY_TEAM) → bezit de doelrol, of bij ontbrekende
   *    doelrol (THRESHOLD-fallback) de MANAGER/ORG_ADMIN-rol. SUPERUSER mag altijd.
   */
  private assertIsApprover(
    user: User,
    request: { kind: ApprovalKind; approverRole: Role | null; approverUserId: string | null } | null,
  ): void {
    if (user.roles.includes(Role.SUPERUSER)) return;
    if (!request) {
      // Geen verzoek gevonden: val terug op de verplichte fallback-doelgroep.
      if (!user.roles.some((r) => MANDATORY_FALLBACK_ROLES.includes(r)))
        throw new ForbiddenException('U bent niet de aangewezen goedkeurder voor deze offerte');
      return;
    }
    if (request.kind === ApprovalKind.VOLUNTARY_PERSON) {
      if (request.approverUserId !== user.id)
        throw new ForbiddenException('Dit goedkeuringsverzoek is aan iemand anders gericht');
      return;
    }
    const targetRoles = request.approverRole ? [request.approverRole] : MANDATORY_FALLBACK_ROLES;
    if (!user.roles.some((r) => targetRoles.includes(r)))
      throw new ForbiddenException('U heeft niet de vereiste rol om dit verzoek goed te keuren');
  }

  private async usersWithRoles(orgId: string, roles: Role[], excludeUserId?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        orgId,
        isActive: true,
        isDeleted: false,
        roles: { hasSome: roles },
      },
      select: { id: true },
    });
    return users
      .map((u) => u.id)
      .filter((uid) => uid !== excludeUserId);
  }

  private fullName(user: User): string {
    return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
  }
}
