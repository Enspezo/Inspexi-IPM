import { BadRequestException, Injectable } from '@nestjs/common';
import { AssetNodeType, User } from '@prisma/client';
import { AssetTypesService } from '../asset-types/asset-types.service';
import { LocationTypesService } from '../location-types/location-types.service';

/**
 * Boom-invarianten en type-constraints voor de unified AssetNode-boom
 * (docs/PLAN-ASSET-NODE-TREE.md §3.1). De service-laag dwingt deze af; de DB
 * onderhoudt alleen `path`/`depth` via triggers.
 *
 * Path-helpers werken op de ltree-tekstrepresentatie (labels gescheiden door
 * `.`), zoals teruggegeven door `path::text` uit de raw queries.
 */
@Injectable()
export class TreeService {
  constructor(
    private readonly assetTypes: AssetTypesService,
    private readonly locationTypes: LocationTypesService,
  ) {}

  // ── Pure ltree-path-helpers ───────────────────────────────

  /** Eerste label van een pad = (hyphen-stripped) id van de boom-wortel. */
  rootLabel(path: string): string {
    return path.split('.')[0];
  }

  /** True als `candidate` gelijk is aan of een afstammeling is van `ancestor`. */
  isSelfOrDescendant(candidate: string, ancestor: string): boolean {
    return candidate === ancestor || candidate.startsWith(`${ancestor}.`);
  }

  /** True als twee nodes in dezelfde boom (zelfde wortel) zitten. */
  sameTree(pathA: string, pathB: string): boolean {
    return this.rootLabel(pathA) === this.rootLabel(pathB);
  }

  // ── Invarianten (§3.1) ────────────────────────────────────

  /**
   * Invarianten 1, 3, 4: welke parent-nodeType is toegestaan voor een child-nodeType.
   * - `parentType === null` → child wordt een wortel → moet LOCATION zijn.
   * - LOCATION-child mag alleen onder een LOCATION (invariant 3).
   * - ASSET-child mag onder LOCATION of ASSET (invariant 4).
   */
  assertParentTypeAllowed(childType: AssetNodeType, parentType: AssetNodeType | null): void {
    if (parentType === null) {
      if (childType !== AssetNodeType.LOCATION) {
        throw new BadRequestException('Een wortel-node moet een LOCATION zijn');
      }
      return;
    }
    if (childType === AssetNodeType.LOCATION && parentType !== AssetNodeType.LOCATION) {
      throw new BadRequestException('Een LOCATION-node mag alleen onder een andere LOCATION-node');
    }
  }

  /**
   * Invariant 5: type-constraints binnen hetzelfde niveau.
   * - ASSET → ASSET: AssetTypeConstraint.
   * - LOCATION → LOCATION: LocationTypeConstraint.
   * - LOCATION → ASSET (eerste asset onder een locatie): altijd toegestaan, geen constraint.
   * - Wortel (parentType null): geen constraint (de wortel hangt 1:1 aan een CRM-Locatie).
   */
  async validateTypeConstraint(
    child: { nodeType: AssetNodeType; typeCode: string },
    parent: { nodeType: AssetNodeType; typeCode: string } | null,
    user: User,
  ): Promise<void> {
    if (parent === null) return;

    if (child.nodeType === AssetNodeType.ASSET && parent.nodeType === AssetNodeType.ASSET) {
      const res = await this.assetTypes.validateParentConstraint(
        child.typeCode,
        parent.typeCode,
        user,
      );
      if (!res.valid) throw new BadRequestException(res.message || 'Ongeldig ouder-type');
      return;
    }

    if (child.nodeType === AssetNodeType.LOCATION && parent.nodeType === AssetNodeType.LOCATION) {
      const res = await this.locationTypes.validateParentConstraint(
        child.typeCode,
        parent.typeCode,
        user,
      );
      if (!res.valid) throw new BadRequestException(res.message || 'Ongeldig ouder-type');
      return;
    }

    // LOCATION → ASSET is altijd toegestaan; LOCATION → ASSET-parent is al door
    // assertParentTypeAllowed afgevangen.
  }
}
