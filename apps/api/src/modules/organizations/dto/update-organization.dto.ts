import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateOrganizationDto } from './create-organization.dto';

export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {
  @ApiPropertyOptional({
    example: true,
    description: 'Organisatie actief; inactieve orgs zijn niet meer bereikbaar via hun subdomein',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Interne chat aan/uit voor deze organisatie (REQ1)',
  })
  @IsOptional()
  @IsBoolean()
  chatEnabled?: boolean;

  @ApiPropertyOptional({
    example: true,
    description:
      'Vier-ogen-controle verplicht: inspectieplannen moeten beoordeeld worden vóór afronding (PRD-13)',
  })
  @IsOptional()
  @IsBoolean()
  inspectionReviewEnabled?: boolean;

  @ApiPropertyOptional({
    example: false,
    description:
      'AI-voorcontrole van inspectierapporten aan/uit (PRD-13); vereist het AI_REVIEW-entitlement',
  })
  @IsOptional()
  @IsBoolean()
  aiReviewEnabled?: boolean;

  @ApiPropertyOptional({
    example: 'Let extra op NEN 3140-terminologie.',
    description: 'Optionele org-specifieke instructies voor de AI-voorcontrole (PRD-13)',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  aiReviewInstructions?: string;

  @ApiPropertyOptional({
    example: false,
    description:
      'Online herstel standaard aan voor nieuwe inspecties (PRD-14); vereist het ONLINE_HERSTEL-entitlement',
  })
  @IsOptional()
  @IsBoolean()
  onlineRepairDefault?: boolean;
}
