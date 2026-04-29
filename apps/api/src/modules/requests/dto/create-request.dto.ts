import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsObject,
} from 'class-validator';
import { RequestSource, Priority } from '@prisma/client';

export class CreateRequestDto {
  @ApiProperty({ example: 'uuid', description: 'Relatie ID' })
  @IsUUID()
  contactId: string;

  @ApiPropertyOptional({ example: 'uuid', description: 'Locatie ID' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ example: 'uuid', description: 'Toegewezen aan gebruiker ID' })
  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @ApiProperty({ enum: RequestSource, example: RequestSource.MANUAL })
  @IsEnum(RequestSource)
  source: RequestSource;

  @ApiProperty({ example: 'NEN1010 keuring kantoorpand' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: 'Beschrijving van de aanvraag' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: Priority, default: Priority.NORMAL })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  @ApiPropertyOptional({ description: 'Eigen velden (key-value JSON)' })
  @IsOptional()
  @IsObject()
  customFields?: Record<string, any>;
}
