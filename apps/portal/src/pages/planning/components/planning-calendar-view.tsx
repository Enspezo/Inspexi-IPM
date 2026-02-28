import { useRef, useEffect } from 'react';
import type { PlanningItem, PlanningSession } from '@/types';
import { PlanningStatus } from '@/types';

// ─── Calendar Event ───────────────────────────────────────────────────────────

export interface CalendarEvent {
  /** id of the session (multi-day) or item (single-day) */
  eventId: string;
  /** The parent planning item id — used for navigation */
  planningItemId: string;
  scheduledDate: string;
  durationHours: number | null;
  productName: string;
  isMultiDay: boolean;
  sessionNumber?: number;
  totalSessions?: number;
  status: string;
  inspectors: Array<{ isPrimary: boolean; user?: { color?: string; initials?: string } | null }>;
}

/** Flatten PlanningItems (including multi-day sessions) into CalendarEvents */
export function flattenToCalendarEvents(items: PlanningItem[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const item of items) {
    if (item.isMultiDay && item.sessions && item.sessions.length > 0) {
      const activeSessions = item.sessions.filter((s: PlanningSession) => !s.isCancelled && s.scheduledDate);
      const totalSessions = item.sessions.filter((s: PlanningSession) => !s.isCancelled).length;
      for (const session of activeSessions) {
        events.push({
          eventId: session.id,
          planningItemId: item.id,
          scheduledDate: session.scheduledDate!,
          durationHours: session.durationHours ?? item.durationHours,
          productName: item.productName,
          isMultiDay: true,
          sessionNumber: session.sessionNumber,
          totalSessions,
          status: session.status,
          inspectors: session.sessionInspectors?.map(si => ({
            isPrimary: si.isPrimary,
            user: si.user ? { color: si.user.color ?? undefined, initials: si.user.initials ?? undefined } : null,
          })) ?? item.inspectors?.map(i => ({
            isPrimary: i.isPrimary,
            user: i.user ? { color: i.user.color ?? undefined, initials: i.user.initials ?? undefined } : null,
          })) ?? [],
        });
      }
    } else if (!item.isMultiDay && item.scheduledDate) {
      events.push({
        eventId: item.id,
        planningItemId: item.id,
        scheduledDate: item.scheduledDate,
        durationHours: item.durationHours,
        productName: item.productName,
        isMultiDay: false,
        status: item.status,
        inspectors: item.inspectors?.map(i => ({
          isPrimary: i.isPrimary,
          user: i.user ? { color: i.user.color ?? undefined, initials: i.user.initials ?? undefined } : null,
        })) ?? [],
      });
    }
  }
  return events;
}

// ─── Dutch locale ─────────────────────────────────────────────────────────────
export const MONTHS_NL = [
  'Januari', 'Februari', 'Maart', 'April', 'Mei', 'Juni',
  'Juli', 'Augustus', 'September', 'Oktober', 'November', 'December',
];
const DAYS_SHORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

// ─── Calendar constants ───────────────────────────────────────────────────────
const HOUR_HEIGHT = 64; // px per hour in week/day grid

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Returns the Monday (start of week) for the week containing `date`. */
export function getMonday(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay(); // 0=Sun, 1=Mon, …
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

function getEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((e) => isSameDay(new Date(e.scheduledDate), day));
}

/** ISO week number (1–53). Week 1 = week containing first Thursday. */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Move to Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Returns the primary inspector's color (or first inspector, or gray fallback). */
export function getEventColor(event: CalendarEvent): string {
  const primary = event.inspectors.find((i) => i.isPrimary) ?? event.inspectors[0];
  return primary?.user?.color ?? '#6B7280';
}

/** Legacy overload for PlanningItem (used by external code). */
export function getItemColor(item: PlanningItem): string {
  const primary = item.inspectors?.find((i) => i.isPrimary) ?? item.inspectors?.[0];
  return primary?.user?.color ?? '#6B7280';
}

/** Short status badge label */
function _statusLabel(status: PlanningStatus): string {
  const map: Record<string, string> = {
    [PlanningStatus.NOG_TE_PLANNEN]: 'N/B',
    [PlanningStatus.CONCEPT]: 'Concept',
    [PlanningStatus.GEPLAND]: 'Gepland',
    [PlanningStatus.AFGEROND]: '✓',
    [PlanningStatus.VERVALLEN]: '✕',
  };
  return map[status] ?? status;
}

// ─── EventChip (month view) ──────────────────────────────────────────────────

function EventChip({
  event,
  onNavigate,
}: {
  event: CalendarEvent;
  onNavigate: (id: string) => void;
}) {
  const color = getEventColor(event);
  const label = event.isMultiDay && event.sessionNumber && event.totalSessions
    ? `S${event.sessionNumber}/${event.totalSessions} – ${event.productName}`
    : event.productName;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onNavigate(event.planningItemId);
      }}
      className="w-full truncate rounded px-1.5 py-[2px] text-left text-xs font-medium text-white hover:opacity-80 transition-opacity leading-tight"
      style={{
        backgroundColor: color,
        borderLeft: event.isMultiDay ? '3px dashed rgba(255,255,255,0.6)' : undefined,
      }}
      title={label}
    >
      {label}
    </button>
  );
}

// ─── Month View ───────────────────────────────────────────────────────────────

function MonthView({
  events,
  currentDate,
  onDayClick,
  onItemClick,
  onWeekClick,
}: {
  events: CalendarEvent[];
  currentDate: Date;
  onDayClick: (date: Date) => void;
  onItemClick: (id: string) => void;
  onWeekClick: (date: Date) => void;
}) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = getMonday(firstOfMonth);

  return (
    <div className="flex flex-col h-full select-none">
      {/* Header row: week-number spacer + day-of-week labels */}
      <div className="flex flex-shrink-0 bg-gray-50 border-b border-gray-200">
        {/* Spacer aligned with week-number column */}
        <div className="w-8 flex-shrink-0 border-r border-gray-200" />
        {DAYS_SHORT.map((d) => (
          <div
            key={d}
            className="flex-1 py-2 text-center text-xs font-semibold text-gray-500 tracking-wide uppercase"
          >
            {d}
          </div>
        ))}
      </div>

      {/* 6 week rows */}
      <div className="flex flex-col flex-1">
        {Array.from({ length: 6 }, (_, weekIdx) => {
          const weekDays = Array.from({ length: 7 }, (_, dayIdx) =>
            addDays(gridStart, weekIdx * 7 + dayIdx),
          );
          const weekNum = getISOWeekNumber(weekDays[0]);
          const monday = weekDays[0];

          return (
            <div key={weekIdx} className="flex flex-1 border-b border-gray-100 last:border-b-0">
              {/* Clickable week number */}
              <button
                onClick={() => onWeekClick(monday)}
                title={`Week ${weekNum} bekijken`}
                className="w-8 flex-shrink-0 flex items-start justify-center pt-1.5 border-r border-gray-200 text-[11px] font-semibold text-gray-400 hover:text-primary-600 hover:bg-primary-50/60 transition-colors"
              >
                {weekNum}
              </button>

              {/* Day cells */}
              {weekDays.map((day, dayIdx) => {
                const dayEvents = getEventsForDay(events, day);
                const inMonth = day.getMonth() === month;
                const today = isToday(day);

                return (
                  <div
                    key={dayIdx}
                    className={`flex-1 border-r border-gray-100 last:border-r-0 p-1.5 cursor-pointer hover:bg-gray-50 transition-colors overflow-hidden ${
                      !inMonth ? 'bg-gray-50/60' : ''
                    }`}
                    onClick={() => onDayClick(day)}
                  >
                    {/* Day number */}
                    <div className="mb-1 flex items-start">
                      <span
                        className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                          today
                            ? 'bg-blue-600 text-white'
                            : inMonth
                            ? 'text-gray-900'
                            : 'text-gray-300'
                        }`}
                      >
                        {day.getDate()}
                      </span>
                    </div>

                    {/* Events */}
                    <div className="space-y-0.5">
                      {dayEvents.slice(0, 3).map((event) => (
                        <EventChip key={event.eventId} event={event} onNavigate={onItemClick} />
                      ))}
                      {dayEvents.length > 3 && (
                        <p className="px-1 text-[11px] text-gray-500 font-medium">
                          +{dayEvents.length - 3} meer
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Time grid (shared by Week + Day views) ───────────────────────────────────

function TimeGrid({
  days,
  events,
  onItemClick,
  onDayHeaderClick,
  dayStart,
  dayEnd,
}: {
  days: Date[];
  events: CalendarEvent[];
  onItemClick: (id: string) => void;
  /** If provided, day header cells become clickable buttons. */
  onDayHeaderClick?: (date: Date) => void;
  dayStart: number;
  dayEnd: number;
}) {
  const hoursCount = dayEnd - dayStart;
  const now = new Date();
  const currentHourFrac = now.getHours() + now.getMinutes() / 60;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to top of grid on mount (dayStart is already the first visible hour)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [dayStart]);

  return (
    <div className="h-full flex flex-col">
      {/* Column headers */}
      <div className="flex flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="w-14 flex-shrink-0" />
        {days.map((day, i) => {
          const today = isToday(day);
          const dowIdx = (day.getDay() + 6) % 7; // 0=Mon
          const inner = (
            <>
              <div className="text-xs text-gray-500">{DAYS_SHORT[dowIdx]}</div>
              <div
                className={`mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                  today ? 'bg-blue-600 text-white' : 'text-gray-900'
                }`}
              >
                {day.getDate()}
              </div>
            </>
          );

          return onDayHeaderClick ? (
            <button
              key={i}
              onClick={() => onDayHeaderClick(day)}
              title={`${DAYS_SHORT[dowIdx]} ${day.getDate()} bekijken`}
              className={`flex-1 border-l border-gray-100 py-2 text-center cursor-pointer transition-colors hover:bg-gray-50 ${
                today ? 'bg-blue-50' : ''
              }`}
            >
              {inner}
            </button>
          ) : (
            <div
              key={i}
              className={`flex-1 border-l border-gray-100 py-2 text-center ${
                today ? 'bg-blue-50' : ''
              }`}
            >
              {inner}
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex flex-1 overflow-y-auto">
        {/* Hour labels */}
        <div className="w-14 flex-shrink-0 bg-white">
          {Array.from({ length: hoursCount }, (_, i) => (
            <div
              key={i}
              className="flex items-start justify-end pr-2 text-xs text-gray-400"
              style={{ height: HOUR_HEIGHT }}
            >
              <span className="-mt-2">
                {String(dayStart + i).padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day, dayIdx) => {
          const dayEvents = getEventsForDay(events, day);
          const todayCol = isToday(day);

          return (
            <div
              key={dayIdx}
              className={`relative flex-1 border-l border-gray-100 ${
                todayCol ? 'bg-blue-50/20' : ''
              }`}
              style={{ height: hoursCount * HOUR_HEIGHT, minHeight: hoursCount * HOUR_HEIGHT }}
            >
              {/* Horizontal hour lines */}
              {Array.from({ length: hoursCount }, (_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t border-gray-100"
                  style={{ top: i * HOUR_HEIGHT }}
                />
              ))}

              {/* Current time indicator */}
              {todayCol &&
                currentHourFrac >= dayStart &&
                currentHourFrac < dayEnd && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
                    style={{ top: (currentHourFrac - dayStart) * HOUR_HEIGHT }}
                  >
                    <div className="-ml-1 h-2.5 w-2.5 rounded-full bg-blue-500 border-2 border-white shadow" />
                    <div className="h-px flex-1 bg-blue-500" />
                  </div>
                )}

              {/* Events (single-day items + multi-day sessions) */}
              {dayEvents.map((event) => {
                const start = new Date(event.scheduledDate);
                const startFrac = start.getHours() + start.getMinutes() / 60;
                const duration = event.durationHours ?? 1;
                const top = Math.max(0, (startFrac - dayStart) * HOUR_HEIGHT);
                const height = Math.max(28, duration * HOUR_HEIGHT - 2);
                const color = getEventColor(event);
                const sessionLabel = event.isMultiDay && event.sessionNumber && event.totalSessions
                  ? `S${event.sessionNumber}/${event.totalSessions} `
                  : '';

                return (
                  <button
                    key={event.eventId}
                    onClick={() => onItemClick(event.planningItemId)}
                    className="absolute left-0.5 right-0.5 overflow-hidden rounded px-1.5 py-1 text-left text-white hover:opacity-90 transition-opacity shadow-sm"
                    style={{
                      top,
                      height,
                      backgroundColor: color,
                      zIndex: 5,
                      borderLeft: event.isMultiDay ? '3px dashed rgba(255,255,255,0.6)' : undefined,
                    }}
                    title={`${sessionLabel}${event.productName}`}
                  >
                    <div className="truncate text-xs font-semibold leading-tight">
                      {sessionLabel}{event.productName}
                    </div>
                    {height > 40 && (
                      <div className="truncate text-[11px] opacity-90 mt-0.5">
                        {start.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                        {event.durationHours ? ` · ${event.durationHours} uur` : ''}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({
  events,
  currentDate,
  onItemClick,
  onDayClick,
  dayStart,
  dayEnd,
}: {
  events: CalendarEvent[];
  currentDate: Date;
  onItemClick: (id: string) => void;
  onDayClick: (date: Date) => void;
  dayStart: number;
  dayEnd: number;
}) {
  const monday = getMonday(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <TimeGrid
      days={days}
      events={events}
      onItemClick={onItemClick}
      onDayHeaderClick={onDayClick}
      dayStart={dayStart}
      dayEnd={dayEnd}
    />
  );
}

// ─── Day View ─────────────────────────────────────────────────────────────────

function DayView({
  events,
  currentDate,
  onItemClick,
  dayStart,
  dayEnd,
}: {
  events: CalendarEvent[];
  currentDate: Date;
  onItemClick: (id: string) => void;
  dayStart: number;
  dayEnd: number;
}) {
  return (
    <TimeGrid
      days={[currentDate]}
      events={events}
      onItemClick={onItemClick}
      dayStart={dayStart}
      dayEnd={dayEnd}
    />
  );
}

// ─── Public export ────────────────────────────────────────────────────────────

export type CalendarViewMode = 'maand' | 'week' | 'dag';

interface PlanningCalendarViewProps {
  items: PlanningItem[];
  view: CalendarViewMode;
  currentDate: Date;
  /** Day cell clicked in month view → switch to dag view */
  onDayClick: (date: Date) => void;
  /** Week number clicked in month view → switch to week view */
  onWeekClick: (date: Date) => void;
  /** Planning item clicked → navigate to detail */
  onItemClick: (id: string) => void;
  /** Start of the visible time window (hour, 0–23). Default: 8 */
  dayStart?: number;
  /** End of the visible time window (hour, 1–24). Default: 17 */
  dayEnd?: number;
}

export function PlanningCalendarView({
  items,
  view,
  currentDate,
  onDayClick,
  onWeekClick,
  onItemClick,
  dayStart = 8,
  dayEnd = 17,
}: PlanningCalendarViewProps) {
  // Flatten planning items (including multi-day sessions) into calendar events
  const events = flattenToCalendarEvents(items);

  if (view === 'maand') {
    return (
      <MonthView
        events={events}
        currentDate={currentDate}
        onDayClick={onDayClick}
        onItemClick={onItemClick}
        onWeekClick={onWeekClick}
      />
    );
  }
  if (view === 'week') {
    return (
      <WeekView
        events={events}
        currentDate={currentDate}
        onItemClick={onItemClick}
        onDayClick={onDayClick}
        dayStart={dayStart}
        dayEnd={dayEnd}
      />
    );
  }
  return (
    <DayView
      events={events}
      currentDate={currentDate}
      onItemClick={onItemClick}
      dayStart={dayStart}
      dayEnd={dayEnd}
    />
  );
}
