import { Injectable } from '@nestjs/common';
import { User, AssetNodeType, Role } from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  orgScope,
  STATUS_PENDING_REVIEW,
  STATUS_REVIEWED,
  STATUS_APPROVED,
  STATUS_COMPLETED,
  STATUS_OPEN,
} from '@/common';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';

/** PWA-dashboard samenvatting (org-scoped, read-only). */
export interface DashboardStats {
  totalThisMonth: number;
  pendingReview: number;
  completedThisWeek: number;
  criticalFindings: number;
  totalAssets: number;
  totalLocations: number;
}

/**
 * B-001: KPI-tegels van het staf-dashboard. Inspectiedomein-tellingen zijn
 * `null` wanneer de org het BASIS_INSPECTIES-entitlement mist — de portal
 * verbergt die tegels dan (zelfde gating als de sidebar).
 */
export interface StaffDashboardStats {
  activeInspections: number | null;
  activeUsers: number;
  reports: number | null;
}

export interface ChartDataPoint {
  week: string;
  count: number;
}

export interface ActivityItem {
  id: string;
  type:
    | 'inspection_submitted'
    | 'inspection_approved'
    | 'inspection_rejected'
    | 'contact_created';
  title: string;
  description: string;
  timestamp: string;
  user: string;
}

/**
 * Read-only aggregaties voor het PWA/dashboard. Geen schrijfacties, geen nieuwe
 * modellen, geen LookupService — puur tellen/groeperen met `orgScope(user)`.
 *
 * SUPERUSER (orgId null) krijgt via `orgScope` een lege filter en ziet dus alle
 * organisaties; org-gebruikers worden gescoped op hun eigen `orgId`.
 */
@Injectable()
export class PortalStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * B-001: tellingen voor de KPI-tegels van het staf-dashboard (portal).
   *
   * - `activeInspections`: lopende inspectieplannen (nog niet approved/completed;
   *   `cancelled` telt evenmin mee) — org-scoped, exclusief soft-deleted.
   * - `activeUsers`: actieve gebruikers van de org.
   * - `reports`: gegenereerde documenten (rapporten) van de org.
   *
   * Feature-gating conform de sidebar: zonder BASIS_INSPECTIES zijn de
   * inspectiedomein-tellingen `null` (de portal verbergt die tegels).
   * SUPERUSER (orgId null) krijgt via orgScope alle organisaties én — net als
   * bij `GET /organizations/me/features` — impliciet alle features.
   */
  async getStaffDashboardStats(user: User): Promise<StaffDashboardStats> {
    const scope = orgScope(user);

    const hasInspections =
      !user.orgId || user.roles.includes(Role.SUPERUSER)
        ? true
        : (await this.entitlements.getEnabledFeatures(user.orgId)).includes(
            'BASIS_INSPECTIES',
          );

    const [activeUsers, activeInspections, reports] = await Promise.all([
      this.prisma.user.count({ where: { ...scope, isActive: true } }),
      hasInspections
        ? this.prisma.inspectionPlan.count({
            where: {
              ...scope,
              deletedAt: null,
              statusCode: { notIn: [STATUS_APPROVED, STATUS_COMPLETED, 'cancelled'] },
            },
          })
        : Promise.resolve(null),
      hasInspections
        ? this.prisma.generatedDocument.count({ where: { ...scope } })
        : Promise.resolve(null),
    ]);

    return { activeInspections, activeUsers, reports };
  }

  /**
   * Dashboard-samenvatting: tellingen voor de huidige maand/week, openstaande
   * reviews, kritieke bevindingen, assets en locaties — org-scoped.
   */
  async getDashboardStats(user: User): Promise<DashboardStats> {
    const scope = orgScope(user);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // All six KPI counts are independent — run them in one round-trip instead
    // of six sequential awaits (this is the dashboard landing endpoint).
    // Kritieke bevindingen: classificatie staat in JSON (classificationValues),
    // Prisma kan daar niet betrouwbaar op filteren — tel daarom alle openstaande
    // bevindingen als indicator. (Identiek aan de App-implementatie.)
    const [
      totalThisMonth,
      pendingReview,
      completedThisWeek,
      criticalFindings,
      totalAssets,
      totalLocations,
    ] = await Promise.all([
      this.prisma.inspectionPlan.count({
        where: { ...scope, deletedAt: null, createdAt: { gte: startOfMonth } },
      }),
      this.prisma.inspectionPlan.count({
        where: { ...scope, deletedAt: null, statusCode: { in: [STATUS_PENDING_REVIEW, STATUS_REVIEWED] } },
      }),
      this.prisma.inspectionPlan.count({
        where: { ...scope, deletedAt: null, statusCode: { in: [STATUS_COMPLETED, STATUS_APPROVED] }, updatedAt: { gte: startOfWeek } },
      }),
      this.prisma.finding.count({
        where: { ...scope, deletedAt: null, statusCode: STATUS_OPEN },
      }),
      this.prisma.assetNode.count({
        where: { ...scope, deletedAt: null, nodeType: AssetNodeType.ASSET },
      }),
      this.prisma.assetNode.count({
        where: { ...scope, deletedAt: null, nodeType: AssetNodeType.LOCATION },
      }),
    ]);

    return {
      totalThisMonth,
      pendingReview,
      completedThisWeek,
      criticalFindings,
      totalAssets,
      totalLocations,
    };
  }

  /**
   * Tijdreeks voor de grafiek: aantal aangemaakte inspectieplannen per week
   * over de laatste 8 weken — org-scoped.
   */
  async getInspectionsChart(user: User): Promise<ChartDataPoint[]> {
    const scope = orgScope(user);
    const now = new Date();

    // Build the 8 week ranges, then count them all in one round-trip.
    const weekRanges: { weekStart: Date; weekEnd: Date }[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() - i * 7);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      weekRanges.push({ weekStart, weekEnd });
    }

    const counts = await Promise.all(
      weekRanges.map(({ weekStart, weekEnd }) =>
        this.prisma.inspectionPlan.count({
          where: { ...scope, deletedAt: null, createdAt: { gte: weekStart, lt: weekEnd } },
        }),
      ),
    );

    return weekRanges.map(({ weekStart }, i) => ({
      week: `Week ${this.getWeekNumber(weekStart)}`,
      count: counts[i],
    }));
  }

  /**
   * Recente activiteiten: laatst bijgewerkte inspectieplannen (ingediend/
   * goedgekeurd) gecombineerd met recent aangemaakte contacten — org-scoped,
   * gesorteerd op tijd en gelimiteerd tot 10.
   */
  async getRecentActivities(user: User): Promise<ActivityItem[]> {
    const scope = orgScope(user);
    const activities: ActivityItem[] = [];

    // Recente inspectieplannen + contacten zijn onafhankelijk → parallel ophalen.
    const [recentInspections, recentContacts] = await Promise.all([
      this.prisma.inspectionPlan.findMany({
        where: {
          ...scope,
          deletedAt: null,
          statusCode: {
            in: [STATUS_PENDING_REVIEW, STATUS_APPROVED, STATUS_REVIEWED, STATUS_COMPLETED],
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        include: {
          assignedUser: { select: { firstName: true, lastName: true } },
          contact: {
            select: { companyName: true, firstName: true, lastName: true },
          },
        },
      }),
      this.prisma.contact.findMany({
        where: { ...scope, isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          companyName: true,
          firstName: true,
          lastName: true,
          createdAt: true,
        },
      }),
    ]);

    for (const inspection of recentInspections) {
      let type: ActivityItem['type'];
      let title: string;

      switch (inspection.statusCode) {
        case STATUS_PENDING_REVIEW:
        case STATUS_REVIEWED:
          type = 'inspection_submitted';
          title = 'Inspectie ingediend';
          break;
        case STATUS_APPROVED:
        case STATUS_COMPLETED:
          type = 'inspection_approved';
          title = 'Inspectie goedgekeurd';
          break;
        default:
          continue;
      }

      const userName = inspection.assignedUser
        ? `${inspection.assignedUser.firstName} ${inspection.assignedUser.lastName}`
        : 'Onbekend';

      const contactName = this.contactDisplayName(inspection.contact);

      activities.push({
        id: inspection.id,
        type,
        title,
        description: `${inspection.normTypeCode} inspectie voor ${contactName || inspection.projectName}`,
        timestamp: inspection.updatedAt.toISOString(),
        user: userName,
      });
    }

    // Recente contacten (in de App: clients) — opgehaald in de Promise.all hierboven.
    for (const contact of recentContacts) {
      activities.push({
        id: `contact-${contact.id}`,
        type: 'contact_created',
        title: 'Nieuwe klant aangemaakt',
        description: this.contactDisplayName(contact) || '—',
        timestamp: contact.createdAt.toISOString(),
        user: 'Systeem',
      });
    }

    // Sorteer op tijd en pak de top 10
    activities.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return activities.slice(0, 10);
  }

  /** Bedrijfsnaam, anders "voornaam achternaam" (zoals de Beheer-conventie). */
  private contactDisplayName(
    contact: {
      companyName: string | null;
      firstName: string | null;
      lastName: string | null;
    } | null,
  ): string {
    if (!contact) return '';
    if (contact.companyName) return contact.companyName;
    return [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  }

  /** ISO-weeknummer. */
  private getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }
}
