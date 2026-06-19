import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  orgScope,
  STATUS_PENDING_REVIEW,
  STATUS_REVIEWED,
  STATUS_APPROVED,
  STATUS_COMPLETED,
  STATUS_OPEN,
} from '@/common';

/** PWA-dashboard samenvatting (org-scoped, read-only). */
export interface DashboardStats {
  totalThisMonth: number;
  pendingReview: number;
  completedThisWeek: number;
  criticalFindings: number;
  totalAssets: number;
  totalLocations: number;
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
  constructor(private readonly prisma: PrismaService) {}

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

    // Totaal aantal inspectieplannen deze maand
    const totalThisMonth = await this.prisma.inspectionPlan.count({
      where: {
        ...scope,
        deletedAt: null,
        createdAt: { gte: startOfMonth },
      },
    });

    // Wacht op review (statusCode = pending_review of reviewed)
    const pendingReview = await this.prisma.inspectionPlan.count({
      where: {
        ...scope,
        deletedAt: null,
        statusCode: { in: [STATUS_PENDING_REVIEW, STATUS_REVIEWED] },
      },
    });

    // Afgerond deze week (statusCode = completed of approved)
    const completedThisWeek = await this.prisma.inspectionPlan.count({
      where: {
        ...scope,
        deletedAt: null,
        statusCode: { in: [STATUS_COMPLETED, STATUS_APPROVED] },
        updatedAt: { gte: startOfWeek },
      },
    });

    // Kritieke bevindingen: classificatie staat in JSON (classificationValues),
    // Prisma kan daar niet betrouwbaar op filteren — tel daarom alle openstaande
    // bevindingen als indicator. (Identiek aan de App-implementatie.)
    const criticalFindings = await this.prisma.finding.count({
      where: {
        ...scope,
        deletedAt: null,
        statusCode: STATUS_OPEN,
      },
    });

    // Totaal aantal assets en locaties (org-scoped)
    const totalAssets = await this.prisma.asset.count({
      where: { ...scope, deletedAt: null },
    });

    const totalLocations = await this.prisma.inspectionLocation.count({
      where: { ...scope, deletedAt: null },
    });

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
    const weeks: ChartDataPoint[] = [];

    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() - i * 7);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const count = await this.prisma.inspectionPlan.count({
        where: {
          ...scope,
          deletedAt: null,
          createdAt: { gte: weekStart, lt: weekEnd },
        },
      });

      weeks.push({
        week: `Week ${this.getWeekNumber(weekStart)}`,
        count,
      });
    }

    return weeks;
  }

  /**
   * Recente activiteiten: laatst bijgewerkte inspectieplannen (ingediend/
   * goedgekeurd) gecombineerd met recent aangemaakte contacten — org-scoped,
   * gesorteerd op tijd en gelimiteerd tot 10.
   */
  async getRecentActivities(user: User): Promise<ActivityItem[]> {
    const scope = orgScope(user);
    const activities: ActivityItem[] = [];

    // Recente inspectieplannen (ingediend/beoordeeld/goedgekeurd/afgerond)
    const recentInspections = await this.prisma.inspectionPlan.findMany({
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
    });

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

    // Recente contacten (in de App: clients)
    const recentContacts = await this.prisma.contact.findMany({
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
    });

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
