// Injecteerbare event-hook voor de herstel-flow (PRD-14). Fase 2 levert bewust
// no-op-implementaties zodat de claim-transactie en de kritiek-check al de juiste
// afloophaken hebben; fase 3 vult hier de notificatie-/e-maildispatch in
// (HERSTEL_CONFLICT, HERINSPECTIE_VOORSTEL, HERSTEL_AFGEROND). Alle hooks zijn
// fire-and-forget: een falende dispatch mag de klant-flow nooit laten falen.

import { Injectable, Logger } from '@nestjs/common';
import type { FindingResolution, RepairSession } from '@prisma/client';

@Injectable()
export class RepairEventsService {
  private readonly logger = new Logger(RepairEventsService.name);

  /** Verloren race: een tweede partij meldde herstel op een al geclaimde constatering. */
  async onRepairConflict(
    session: RepairSession,
    findingId: string,
    conflictResolution: FindingResolution,
  ): Promise<void> {
    this.logger.debug(
      `Herstel-conflict op constatering ${findingId} (sessie ${session.id}, resolutie ${conflictResolution.id}) — dispatch volgt in fase 3`,
    );
  }

  /** Laatste openstaande kritieke constatering van het plan is hersteld gemeld. */
  async onAllCriticalRepaired(planId: string, orgId: string): Promise<void> {
    this.logger.debug(
      `Alle kritieke constateringen hersteld gemeld voor plan ${planId} (org ${orgId}) — dispatch volgt in fase 3`,
    );
  }
}
