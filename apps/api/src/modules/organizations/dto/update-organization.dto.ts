import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
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
}
