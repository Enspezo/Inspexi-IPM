import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class ForAssetQueryDto {
  @ApiProperty({ description: 'Normcode (NormTypeDefinition.code)' })
  @IsString()
  normType: string;

  @ApiProperty({ description: 'Asset-type-code' })
  @IsString()
  assetType: string;

  @ApiPropertyOptional({ description: 'Optioneel locatie-type-filter' })
  @IsOptional()
  @IsString()
  locationType?: string;
}
