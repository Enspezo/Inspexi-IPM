import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsEnum, IsArray } from 'class-validator';
import { Transform } from 'class-transformer';
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

  @ApiPropertyOptional({
    type: [String],
    description: 'Tag-IDs om aan het document te koppelen',
  })
  @IsOptional()
  // multipart/form-data delivers a single value as a string and repeated
  // fields as an array — normalise both into a string[] before validation.
  @Transform(({ value }) =>
    value === undefined || value === null
      ? undefined
      : Array.isArray(value)
        ? value
        : [value],
  )
  @IsArray()
  @IsUUID('all', { each: true })
  tagIds?: string[];
}
