import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  ValidateNested,
  IsString,
  IsOptional,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

export class FinalCheckRuleDto {
  @ApiProperty({
    description: 'allFieldsRequired | sectionComplete | formula | custom',
  })
  @IsString()
  type: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class UpdateFinalCheckRulesDto {
  @ApiProperty({ type: [FinalCheckRuleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FinalCheckRuleDto)
  rules: FinalCheckRuleDto[];
}
