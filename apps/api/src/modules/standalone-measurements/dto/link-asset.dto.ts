import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class LinkAssetDto {
  @ApiProperty({ description: 'Te koppelen asset' })
  @IsUUID()
  assetId: string;
}
