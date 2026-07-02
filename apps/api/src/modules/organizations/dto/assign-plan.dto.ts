import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, ValidateIf } from 'class-validator';

/**
 * Wijs een abonnementsplan toe aan een organisatie, of ontkoppel het (`planId: null`).
 * Alleen SUPERUSER (PRD-09 §5.3).
 */
export class AssignPlanDto {
  @ApiPropertyOptional({
    description: 'Plan-ID om toe te wijzen, of null om het abonnement te ontkoppelen',
    nullable: true,
  })
  @ValidateIf((o) => o.planId !== null)
  @IsUUID()
  planId!: string | null;
}
