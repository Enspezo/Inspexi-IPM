import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { DocumentEntityType } from '@prisma/client';

export class UploadDocumentDto {
  @ApiProperty({ enum: DocumentEntityType })
  @IsEnum(DocumentEntityType)
  entityType: DocumentEntityType;

  @ApiProperty({ example: 'uuid', description: 'ID van de gekoppelde entiteit' })
  @IsUUID()
  entityId: string;

  @ApiPropertyOptional({ example: 'Contract voor inspectie' })
  @IsOptional()
  @IsString()
  description?: string;
}
