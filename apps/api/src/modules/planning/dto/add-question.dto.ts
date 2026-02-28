import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, MinLength } from 'class-validator';

export class AddQuestionDto {
  @ApiProperty({ example: 'Hoe laat arriveren jullie precies?' })
  @IsString()
  @MinLength(1)
  message: string;

  @ApiPropertyOptional({ example: false, description: 'True als dit een bericht van de klant is (via portal)' })
  @IsOptional()
  @IsBoolean()
  isFromClient?: boolean;
}
