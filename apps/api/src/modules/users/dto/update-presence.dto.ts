import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Availability } from '@prisma/client';

export class UpdatePresenceDto {
  @ApiProperty({ enum: Availability })
  @IsEnum(Availability)
  availability: Availability;

  @ApiPropertyOptional({ description: 'Optionele statusnotitie, bv. "In bespreking tot 15:00"' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  availabilityNote?: string;
}
