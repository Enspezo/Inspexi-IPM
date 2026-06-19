import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsArray, IsString, IsInt, Min } from 'class-validator';

export class AddMeasurementSheetLinkDto {
  @ApiProperty({ description: 'Meetstaat-template (globaal)' })
  @IsUUID()
  measurementSheetTemplateId: string;

  @ApiProperty({ type: [String], description: 'Asset-type codes waarvoor deze meetstaat geldt' })
  @IsArray()
  @IsString({ each: true })
  assetTypes: string[];

  @ApiProperty({ default: 0 })
  @IsInt()
  @Min(0)
  sortOrder: number;
}
