import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

/**
 * Tri-state per-org feature-override (PRD-09 §5.3):
 * - `PLAN`     → verwijder de override; volg de plan-default.
 * - `ENABLED`  → bijschakelen bovenop het plan.
 * - `DISABLED` → afschakelen (let op: de dependency-closure kan dit terugdraaien).
 */
export enum OrganizationFeatureState {
  PLAN = 'PLAN',
  ENABLED = 'ENABLED',
  DISABLED = 'DISABLED',
}

export class SetOrganizationFeatureDto {
  @ApiProperty({ enum: OrganizationFeatureState })
  @IsEnum(OrganizationFeatureState)
  state!: OrganizationFeatureState;
}
