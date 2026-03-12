import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsUUID } from 'class-validator';
import { ContactPersonRole } from '@prisma/client';
import { BasePaginationQueryDto } from '@/common/dto';

export class ListContactPersonsQueryDto extends BasePaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter op contact ID' })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiPropertyOptional({ description: 'Zoeken op naam, email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ContactPersonRole })
  @IsOptional()
  @IsEnum(ContactPersonRole)
  role?: ContactPersonRole;
}
