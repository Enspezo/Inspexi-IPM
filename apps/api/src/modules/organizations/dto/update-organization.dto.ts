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
}
