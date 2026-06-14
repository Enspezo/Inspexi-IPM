import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class ValidateParentDto {
  @ApiProperty()
  @IsString()
  assetTypeCode: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  parentAssetTypeCode?: string;
}
