import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { FeatureOverrideState } from '@inspexi/entitlements';

/**
 * Tri-state per-org feature-override (PRD-09 §5.3):
 * - `PLAN`     → verwijder de override; volg de plan-default.
 * - `ENABLED`  → bijschakelen bovenop het plan.
 * - `DISABLED` → afschakelen (let op: de dependency-closure kan dit terugdraaien).
 *
 * De enum zelf leeft in `@inspexi/entitlements` zodat backend-validatie (`@IsEnum`)
 * en de portal-keuze één gedeelde definitie hebben. Hier her-geëxporteerd zodat
 * bestaande imports uit het organizations-dto-barrel blijven werken.
 */
export { FeatureOverrideState };

export class SetOrganizationFeatureDto {
  @ApiProperty({ enum: FeatureOverrideState })
  @IsEnum(FeatureOverrideState)
  state!: FeatureOverrideState;
}
