import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsEnum, MinLength, MaxLength } from 'class-validator';
import { NoteEntityType } from '@prisma/client';

export class CreateNoteDto {
  @ApiProperty({ enum: NoteEntityType })
  @IsEnum(NoteEntityType)
  entityType: NoteEntityType;

  @ApiProperty({ description: 'ID van de gekoppelde entiteit' })
  @IsUUID()
  entityId: string;

  @ApiProperty({ example: 'Besprak factuur met klant' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content: string;

  @ApiPropertyOptional({ description: 'Parent note ID voor een reply (max 1 niveau diep)' })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
