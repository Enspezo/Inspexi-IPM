import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectTimesheetDto {
  @ApiProperty({ description: 'Toelichting voor de inspecteur (verplicht bij afwijzen)' })
  @IsString()
  @MinLength(3, { message: 'Geef een toelichting bij het afwijzen' })
  @MaxLength(2000)
  note: string;
}
