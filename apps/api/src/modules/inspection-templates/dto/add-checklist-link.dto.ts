import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsArray, IsString, IsInt, Min } from 'class-validator';

export class AddChecklistLinkDto {
  @ApiProperty({ description: 'Checklist (org of systeem)' })
  @IsUUID()
  checklistId: string;

  @ApiProperty({ type: [String], description: 'Asset-type codes waarvoor deze checklist geldt' })
  @IsArray()
  @IsString({ each: true })
  assetTypes: string[];

  @ApiProperty({ default: 0 })
  @IsInt()
  @Min(0)
  sortOrder: number;
}
