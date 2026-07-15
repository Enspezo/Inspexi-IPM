import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Role } from '@prisma/client';
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
    description: 'AI-assistent aan/uit voor deze organisatie (kill-switch, PRD-12)',
  })
  @IsOptional()
  @IsBoolean()
  aiAgentEnabled?: boolean;

  @ApiPropertyOptional({
    isArray: true,
    enum: Role,
    description:
      'Rollen die de AI-assistent mogen gebruiken; leeg = systeem-default (staf behalve inspecteur)',
  })
  @IsOptional()
  @IsArray()
  @IsEnum(Role, { each: true })
  aiAgentAllowedRoles?: Role[];
}
