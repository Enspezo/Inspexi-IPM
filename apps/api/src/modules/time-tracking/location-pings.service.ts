import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TimeActivityType, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { orgScope, requireOrg } from '@/common';
import { IngestPingsDto } from './dto';

/** Ping ouder dan dit = geen "live" positie meer (kaartknop verdwijnt). */
const LIVE_WINDOW_MS = 5 * 60_000;
/** Laatste positie tonen tot maximaal 30 minuten oud (PRD-16 §5). */
const LATEST_WINDOW_MS = 30 * 60_000;

export interface ActiveTimerRow {
  entryId: string;
  userId: string;
  userName: string;
  activityType: TimeActivityType;
  startedAt: Date;
  projectId: string | null;
  projectNumber: string | null;
  projectTitle: string | null;
  inspectionPlanId: string | null;
  inspectionPlanName: string | null;
  notes: string | null;
  /** true → GET /time-tracking/locations/:userId/latest levert een pin. */
  hasLiveLocation: boolean;
}

@Injectable()
export class LocationPingsService {
  constructor(private prisma: PrismaService) {}

  // ─── Opt-in (PRD-16 §6.1) ──────────────────────────────

  /** Alleen de gebruiker zelf; consent-moment wordt vastgelegd bij het aanzetten. */
  async setTravelTracking(user: User, enabled: boolean) {
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        travelTrackingEnabled: enabled,
        ...(enabled ? { travelTrackingConsentAt: new Date() } : {}),
      },
      select: { travelTrackingEnabled: true, travelTrackingConsentAt: true },
    });
    return updated;
  }

  // ─── Pings (PRD-16 §6.2) ───────────────────────────────

  /**
   * Batch pings van de eigen PWA. Bewust een 200-noop (accepted: 0) in plaats
   * van een error wanneer de voorwaarden niet (meer) gelden — de app hoeft een
   * race (timer nét gestopt, toggle nét uit) niet als fout te behandelen.
   */
  async ingest(user: User, dto: IngestPingsDto): Promise<{ accepted: number }> {
    const orgId = requireOrg(user);

    // Autoritatieve serverstaat, niet de JWT-snapshot.
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { travelTrackingEnabled: true },
    });
    if (!dbUser?.travelTrackingEnabled) return { accepted: 0 };

    const running = await this.prisma.timeEntry.findFirst({
      where: {
        orgId,
        userId: user.id,
        endedAt: null,
        isDeleted: false,
        activityType: TimeActivityType.REISTIJD,
      },
      select: { id: true },
    });
    if (!running) return { accepted: 0 };

    const now = Date.now();
    const rows = dto.pings
      .map((p) => ({ ...p, recorded: new Date(p.recordedAt) }))
      .filter(
        (p) =>
          !Number.isNaN(p.recorded.getTime()) &&
          // Geen toekomst-pings en niets ouder dan het live-venster ×6 (buffertje).
          p.recorded.getTime() <= now + 60_000 &&
          p.recorded.getTime() >= now - 30 * 60_000,
      );
    if (rows.length === 0) return { accepted: 0 };

    await this.prisma.inspectorLocationPing.createMany({
      data: rows.map((p) => ({
        orgId,
        userId: user.id,
        timeEntryId: running.id,
        latitude: new Prisma.Decimal(p.latitude),
        longitude: new Prisma.Decimal(p.longitude),
        accuracyM: p.accuracyM ?? null,
        recordedAt: p.recorded,
      })),
    });
    return { accepted: rows.length };
  }

  // ─── Staf: live overzicht + kaart (PRD-16 §6.4) ────────

  /** Lopende timers per inspecteur, incl. of er een live positie beschikbaar is. */
  async getActive(user: User): Promise<ActiveTimerRow[]> {
    const entries = await this.prisma.timeEntry.findMany({
      where: { ...orgScope(user), endedAt: null, isDeleted: false },
      orderBy: { startedAt: 'asc' },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, travelTrackingEnabled: true },
        },
        project: { select: { id: true, projectNumber: true, title: true } },
        inspectionPlan: { select: { id: true, projectName: true } },
      },
    });
    if (entries.length === 0) return [];

    // Recentste ping per gebruiker binnen het live-venster, in één groupBy.
    const liveSince = new Date(Date.now() - LIVE_WINDOW_MS);
    const latest = await this.prisma.inspectorLocationPing.groupBy({
      by: ['userId'],
      where: {
        userId: { in: entries.map((e) => e.userId) },
        recordedAt: { gte: liveSince },
      },
      _max: { recordedAt: true },
    });
    const liveUserIds = new Set(latest.map((l) => l.userId));

    return entries.map((e) => ({
      entryId: e.id,
      userId: e.userId,
      userName: `${e.user.firstName} ${e.user.lastName}`.trim(),
      activityType: e.activityType,
      startedAt: e.startedAt,
      projectId: e.project?.id ?? null,
      projectNumber: e.project?.projectNumber ?? null,
      projectTitle: e.project?.title ?? null,
      inspectionPlanId: e.inspectionPlan?.id ?? null,
      inspectionPlanName: e.inspectionPlan?.projectName ?? null,
      notes: e.notes,
      hasLiveLocation:
        e.activityType === TimeActivityType.REISTIJD &&
        e.user.travelTrackingEnabled &&
        liveUserIds.has(e.userId),
    }));
  }

  /**
   * Laatste positie (< 30 min) van een inspecteur + de bestemming van zijn
   * lopende REISTIJD-timer (plan-GPS, fallback de geocode-cache van de
   * CRM-locatie van het plan). Geen route-historie — bewust alleen de laatste pin.
   */
  async getLatestLocation(userId: string, user: User) {
    const ping = await this.prisma.inspectorLocationPing.findFirst({
      where: {
        ...orgScope(user),
        userId,
        recordedAt: { gte: new Date(Date.now() - LATEST_WINDOW_MS) },
      },
      orderBy: { recordedAt: 'desc' },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!ping) {
      throw new NotFoundException('Geen recente positie beschikbaar');
    }

    const running = await this.prisma.timeEntry.findFirst({
      where: {
        ...orgScope(user),
        userId,
        endedAt: null,
        isDeleted: false,
        activityType: TimeActivityType.REISTIJD,
      },
      include: {
        inspectionPlan: {
          select: {
            projectName: true,
            gpsLatitude: true,
            gpsLongitude: true,
            addressStreet: true,
            addressHouseNumber: true,
            addressCity: true,
            location: { select: { lat: true, lng: true, street: true, city: true } },
          },
        },
      },
    });

    let destination: {
      latitude: number;
      longitude: number;
      label: string;
    } | null = null;
    const plan = running?.inspectionPlan;
    if (plan) {
      const lat = plan.gpsLatitude ? Number(plan.gpsLatitude) : plan.location?.lat ?? null;
      const lng = plan.gpsLongitude ? Number(plan.gpsLongitude) : plan.location?.lng ?? null;
      if (lat != null && lng != null) {
        const address = [plan.addressStreet ?? plan.location?.street, plan.addressCity ?? plan.location?.city]
          .filter(Boolean)
          .join(', ');
        destination = {
          latitude: lat,
          longitude: lng,
          label: address ? `${plan.projectName} — ${address}` : plan.projectName,
        };
      }
    }

    return {
      userId,
      userName: `${ping.user.firstName} ${ping.user.lastName}`.trim(),
      latitude: Number(ping.latitude),
      longitude: Number(ping.longitude),
      accuracyM: ping.accuracyM,
      recordedAt: ping.recordedAt,
      destination,
    };
  }
}
