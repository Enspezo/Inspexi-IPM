import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

/**
 * Minimal Prisma delegate shape needed to validate a project-phase link.
 * Kept loose so any `this.prisma.projectPhase` can be passed in.
 */
interface PhaseDelegate {
  findUnique(args: {
    where: { id: string };
    select: { orgId: true; projectId: true; isDeleted: true };
  }): Promise<{ orgId: string; projectId: string; isDeleted: boolean } | null>;
}

export interface PhaseLinkResult {
  /** The value to write to the entity's `projectPhaseId` column (`null` = unlink). */
  phaseId: string | null;
  /**
   * The phase's own `projectId`. Present only when linking to a real phase, so the
   * caller can cascade it onto entities that also carry a `projectId` (§12.4.2).
   */
  projectId?: string;
}

/**
 * Validate a `projectPhaseId` link on an entity and return what to persist (§12.4.2).
 *
 * - `projectPhaseId === undefined` → returns `undefined` (caller leaves the field untouched)
 * - `projectPhaseId === null` → returns `{ phaseId: null }` (unlink; no project change)
 * - a value → validates the phase exists, is not deleted, belongs to the caller's org,
 *   and — when the entity already has a `projectId` — that it matches the phase's project.
 *
 * Ordering matters: the org check runs before the project-consistency check so a
 * cross-tenant injection yields 403 (not 400).
 *
 * `entityProjectId`:
 * - `undefined` → the entity has no project column (e.g. WorkOrder): skip the
 *   consistency check entirely; only org + existence are validated.
 * - `null` → the entity has a project column but it is currently empty: the phase's
 *   project is auto-cascaded onto it.
 * - a value → must equal the phase's project, else `BadRequestException` (400).
 */
export async function resolvePhaseLink(
  phaseModel: PhaseDelegate,
  projectPhaseId: string | null | undefined,
  orgId: string | null,
  entityProjectId: string | null | undefined,
): Promise<PhaseLinkResult | undefined> {
  if (projectPhaseId === undefined) return undefined;
  if (projectPhaseId === null) return { phaseId: null };

  const phase = await phaseModel.findUnique({
    where: { id: projectPhaseId },
    select: { orgId: true, projectId: true, isDeleted: true },
  });

  if (!phase || phase.isDeleted) {
    throw new NotFoundException('Fase niet gevonden');
  }
  if (orgId !== null && phase.orgId !== orgId) {
    throw new ForbiddenException('Fase hoort niet bij uw organisatie');
  }
  if (entityProjectId != null && entityProjectId !== phase.projectId) {
    throw new BadRequestException(
      'De gekozen fase hoort bij een ander project dan deze entiteit',
    );
  }

  return { phaseId: projectPhaseId, projectId: phase.projectId };
}
