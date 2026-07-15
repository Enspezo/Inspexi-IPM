import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, Role, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '@/modules/notifications/notifications.service';

/** Ontvangers van "door inspecteur"-meldingen: org-management + werkvoorbereiders. */
const INSPECTOR_CHANGE_RECIPIENT_ROLES: Role[] = [
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.WERKVOORBEREIDER,
];

/**
 * Fire-and-forget notificaties voor beschikbaarheidswijzigingen (PRD §12.7).
 *
 * Alle methoden zijn synchroon (return void) en verrichten hun lookups + dispatch
 * op de achtergrond, zodat ze een request nooit blokkeren of laten falen — exact
 * het bestaande dispatch-patroon.
 */
@Injectable()
export class AvailabilityNotifier {
  private readonly logger = new Logger(AvailabilityNotifier.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /** Uitzondering aangemaakt/gewijzigd/verwijderd. */
  exceptionChanged(
    actor: User,
    targetUserId: string,
    orgId: string | null,
    exceptionId: string,
    action: 'aangemaakt' | 'gewijzigd' | 'verwijderd',
  ): void {
    if (!orgId) return;
    this.run(async () => {
      if (actor.id === targetUserId) {
        // Inspecteur wijzigt eigen uitzondering → management + werkvoorbereiders.
        const recipients = await this.roleRecipients(orgId, actor.id);
        const name = this.displayName(actor);
        this.notifications.dispatch({
          type: NotificationType.BESCHIKBAARHEID_GEWIJZIGD_DOOR_INSPECTEUR,
          orgId,
          recipientUserIds: recipients,
          title: 'Beschikbaarheid gewijzigd',
          body: `${name} heeft een beschikbaarheids-uitzondering ${action}.`,
          entityType: 'availabilityException',
          entityId: exceptionId,
        });
      } else {
        // Manager wijzigt uitzondering van een inspecteur → de inspecteur.
        this.notifications.dispatch({
          type: NotificationType.BESCHIKBAARHEID_GEWIJZIGD_DOOR_MANAGER,
          orgId,
          recipientUserIds: [targetUserId],
          title: 'Beschikbaarheid gewijzigd',
          body: `${this.displayName(actor)} heeft een uitzondering in jouw beschikbaarheid ${action}.`,
          entityType: 'availabilityException',
          entityId: exceptionId,
        });
      }
    });
  }

  /** Manager wijzigt het weekschema of de dienstvorm van een inspecteur → de inspecteur. */
  managerChangedForUser(
    actor: User,
    targetUserId: string,
    orgId: string | null,
    body: string,
  ): void {
    if (!orgId || actor.id === targetUserId) return;
    this.notifications.dispatch({
      type: NotificationType.BESCHIKBAARHEID_GEWIJZIGD_DOOR_MANAGER,
      orgId,
      recipientUserIds: [targetUserId],
      title: 'Beschikbaarheid gewijzigd',
      body,
      entityType: 'user',
      entityId: targetUserId,
    });
  }

  // ─── Intern ───────────────────────────────────────────────

  /**
   * Alle ORG_ADMIN/MANAGER/WERKVOORBEREIDER-users van de org. Bewust breed
   * (PRD 12.7); bij grote organisaties dempen gebruikers dit zelf via de
   * notificatievoorkeuren-groep BESCHIKBAARHEID.
   */
  private async roleRecipients(orgId: string, excludeUserId: string): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        orgId,
        isDeleted: false,
        roles: { hasSome: INSPECTOR_CHANGE_RECIPIENT_ROLES },
        NOT: { id: excludeUserId },
      },
      select: { id: true },
    });
    return users.map((u) => u.id);
  }

  private displayName(user: User): string {
    return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
  }

  private run(work: () => Promise<void>): void {
    work().catch((err) => this.logger.error('Availability notification failed', err));
  }
}
