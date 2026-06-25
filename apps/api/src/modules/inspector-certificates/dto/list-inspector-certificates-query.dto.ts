import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListInspectorCertificatesQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Certificaten van deze inspecteur. Zonder waarde: management ziet alle inspecteurs, een inspecteur ziet de eigen certificaten.',
  })
  @IsOptional()
  @IsUUID(undefined, { message: 'Ongeldige gebruiker' })
  userId?: string;
}
