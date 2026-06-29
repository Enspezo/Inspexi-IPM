import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssetNodeType } from '@prisma/client';
import { IsString, IsUUID, IsOptional, IsInt, IsObject, IsEnum } from 'class-validator';

export class CreateAssetNodeDto {
  @ApiPropertyOptional({ description: 'Ouder-node (leeg = wortel; vereist rootLocationId)' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ enum: AssetNodeType, description: 'LOCATION of ASSET' })
  @IsEnum(AssetNodeType)
  nodeType: AssetNodeType;

  @ApiProperty({
    example: 'verdeler',
    description: 'Type-code → AssetTypeDefinition.code (ASSET) of LocationTypeDefinition.code (LOCATION)',
  })
  @IsString()
  typeCode: string;

  @ApiProperty({ example: 'Hoofdverdeler' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  identifier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Dynamische velden volgens de type-definitie' })
  @IsOptional()
  @IsObject()
  technicalData?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Alleen bij een wortel-node: 1:1 FK naar de CRM-Locatie' })
  @IsOptional()
  @IsUUID()
  rootLocationId?: string;

  @ApiPropertyOptional({
    description:
      'Handmatig nodenummer. Alleen toegestaan als het nummeringsschema (LOCATION_NODE/ASSET_NODE) handmatige invoer toestaat; anders wordt het serverzijdig gegenereerd.',
  })
  @IsOptional()
  @IsString()
  nodeNumber?: string;
}
