import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Support-toegang in-/uitschakelen (IMP_PRD-10 Fase 5).
 * De organisatie geeft InspeXi-support expliciete, geauditeerde toestemming.
 */
export class SetSupportAccessDto {
  @ApiProperty({ description: 'Support-toegang aan- of uitzetten' })
  @IsBoolean()
  enabled!: boolean;

  /** Optionele JIT-vervaltijd in uren (bv. 24). Weglaten = geen auto-expiry. */
  @ApiPropertyOptional({
    description: 'Automatisch verlopen na dit aantal uren (1–720). Weglaten = geen auto-expiry.',
    minimum: 1,
    maximum: 720,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  expiresInHours?: number;

  @ApiPropertyOptional({ description: 'Optionele reden/notitie bij de wijziging' })
  @IsOptional()
  @IsString()
  note?: string;
}
