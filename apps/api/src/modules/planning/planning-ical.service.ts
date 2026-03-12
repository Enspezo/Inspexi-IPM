import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma';
import { AcceptanceStatus, SessionStatus } from '@prisma/client';

interface IcalSession {
  id: string;
  sessionNumber: number;
  scheduledDate: Date | null;
  durationHours: number | null;
  status: SessionStatus;
  isCancelled: boolean;
  notes?: string | null;
}

@Injectable()
export class PlanningIcalService {
  private readonly logger = new Logger(PlanningIcalService.name);

  constructor(private prisma: PrismaService) {}

  private formatDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  }

  private escapeIcal(text: string): string {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '');
  }

  private buildVEvent(params: {
    uid: string;
    start: Date;
    end: Date;
    summary: string;
    location?: string;
    description?: string;
    status?: string;
  }): string {
    const lines = [
      'BEGIN:VEVENT',
      `UID:${params.uid}`,
      `DTSTAMP:${this.formatDate(new Date())}`,
      `DTSTART:${this.formatDate(params.start)}`,
      `DTEND:${this.formatDate(params.end)}`,
      `SUMMARY:${this.escapeIcal(params.summary)}`,
    ];
    if (params.location) lines.push(`LOCATION:${this.escapeIcal(params.location)}`);
    if (params.description) lines.push(`DESCRIPTION:${this.escapeIcal(params.description)}`);
    lines.push(`STATUS:${params.status ?? 'CONFIRMED'}`, 'END:VEVENT');
    return lines.join('\r\n');
  }

  generateSingleEvent(item: {
    id: string;
    productName: string;
    scheduledDate: Date | null;
    durationHours: number | null;
    isMultiDay?: boolean;
    sessions?: IcalSession[];
    location?: { street?: string | null; houseNumber?: string | null; postalCode?: string | null; city?: string | null } | null;
    contact?: { companyName?: string | null; firstName?: string | null; lastName?: string | null } | null;
  }): string {
    const locationParts = [
      item.location?.street,
      item.location?.houseNumber,
      item.location?.postalCode,
      item.location?.city,
    ].filter(Boolean) as string[];
    const locationStr = locationParts.length > 0 ? locationParts.join(' ') : undefined;

    const contactName =
      item.contact?.companyName ||
      `${item.contact?.firstName ?? ''} ${item.contact?.lastName ?? ''}`.trim() ||
      undefined;

    const header = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//InspeXi//Planning//NL',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ];

    if (item.isMultiDay && item.sessions && item.sessions.length > 0) {
      // Multi-day: one VEVENT per DEFINITIEF (non-cancelled) session that has a date
      const definitiefSessions = item.sessions.filter(
        s => !s.isCancelled && s.scheduledDate && s.status === SessionStatus.DEFINITIEF,
      );
      const totalSessions = item.sessions.filter(s => !s.isCancelled).length;

      const vevents = definitiefSessions.map(session => {
        const start = session.scheduledDate!;
        const end = new Date(start.getTime() + (session.durationHours ?? 2) * 60 * 60 * 1000);
        const summary = `Sessie ${session.sessionNumber}/${totalSessions} – ${item.productName}`;
        const descParts = contactName ? [`Opdrachtgever: ${contactName}`] : [];
        if (session.notes) descParts.push(`Notitie: ${session.notes}`);
        return this.buildVEvent({
          uid: `planning-${item.id}-session-${session.id}@inspexi.nl`,
          start,
          end,
          summary,
          location: locationStr,
          description: descParts.length > 0 ? descParts.join('\n') : undefined,
        });
      });

      return [...header, ...vevents, 'END:VCALENDAR'].join('\r\n');
    }

    // Single-day: single VEVENT (original behavior)
    const startDate = item.scheduledDate ?? new Date();
    const endDate = new Date(startDate.getTime() + (item.durationHours ?? 2) * 60 * 60 * 1000);

    const vevent = this.buildVEvent({
      uid: `planning-${item.id}@inspexi.nl`,
      start: startDate,
      end: endDate,
      summary: item.productName,
      location: locationStr,
      description: contactName ? `Opdrachtgever: ${contactName}` : undefined,
    });

    return [...header, vevent, 'END:VCALENDAR'].join('\r\n');
  }

  async generatePersonalFeed(icalToken: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { icalToken },
      select: { id: true, firstName: true, lastName: true },
    });

    if (!user) return this.emptyCalendar();

    // Single-day: accepted PlanningInspector entries
    const inspectorItems = await this.prisma.planningInspector.findMany({
      where: {
        userId: user.id,
        acceptanceStatus: AcceptanceStatus.ACCEPTED,
        planningItem: {
          isMultiDay: false,
          status: { in: ['GEPLAND', 'AFGEROND'] as any },
          isCancelled: false,
        },
      },
      include: {
        planningItem: {
          include: {
            location: { select: { street: true, houseNumber: true, postalCode: true, city: true } },
            contact: { select: { companyName: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    // Multi-day: accepted PlanningSessionInspector entries for DEFINITIEF sessions
    const sessionInspectorItems = await this.prisma.planningSessionInspector.findMany({
      where: {
        userId: user.id,
        acceptanceStatus: AcceptanceStatus.ACCEPTED,
        session: {
          status: SessionStatus.DEFINITIEF,
          isCancelled: false,
          scheduledDate: { not: null },
        },
      },
      include: {
        session: {
          include: {
            planningItem: {
              include: {
                location: { select: { street: true, houseNumber: true, postalCode: true, city: true } },
                contact: { select: { companyName: true, firstName: true, lastName: true } },
                sessions: { where: { isCancelled: false }, select: { id: true } },
              },
            },
          },
        },
      },
    });

    const header = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//InspeXi//Planning//NL',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:InspeXi - ${user.firstName} ${user.lastName}`,
    ];

    const eventLines: string[] = [];

    // Single-day events
    for (const pi of inspectorItems) {
      const item = pi.planningItem;
      const startDate = item.scheduledDate ?? new Date();
      const endDate = new Date(startDate.getTime() + (item.durationHours ?? 2) * 60 * 60 * 1000);

      const locationParts = [
        item.location?.street,
        item.location?.houseNumber,
        item.location?.postalCode,
        item.location?.city,
      ].filter(Boolean) as string[];

      const icalStatus = item.status === 'AFGEROND' ? 'COMPLETED' : 'CONFIRMED';

      eventLines.push(this.buildVEvent({
        uid: `planning-${item.id}@inspexi.nl`,
        start: startDate,
        end: endDate,
        summary: item.productName,
        location: locationParts.length > 0 ? locationParts.join(' ') : undefined,
        status: icalStatus,
      }));
    }

    // Multi-day session events
    for (const si of sessionInspectorItems) {
      const session = si.session;
      const item = session.planningItem;
      const totalSessions = item.sessions.length;

      const startDate = session.scheduledDate!;
      const endDate = new Date(startDate.getTime() + (session.durationHours ?? 2) * 60 * 60 * 1000);

      const locationParts = [
        item.location?.street,
        item.location?.houseNumber,
        item.location?.postalCode,
        item.location?.city,
      ].filter(Boolean) as string[];

      const summary = `Sessie ${session.sessionNumber}/${totalSessions} – ${item.productName}`;

      eventLines.push(this.buildVEvent({
        uid: `planning-${item.id}-session-${session.id}@inspexi.nl`,
        start: startDate,
        end: endDate,
        summary,
        location: locationParts.length > 0 ? locationParts.join(' ') : undefined,
        description: session.notes ? `Notitie: ${session.notes}` : undefined,
        status: 'CONFIRMED',
      }));
    }

    return [...header, ...eventLines, 'END:VCALENDAR'].join('\r\n');
  }

  private emptyCalendar(): string {
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//InspeXi//Planning//NL',
      'CALSCALE:GREGORIAN',
      'END:VCALENDAR',
    ].join('\r\n');
  }
}
