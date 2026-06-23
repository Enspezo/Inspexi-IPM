import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Bijwerken van een plan. De slug is bewust niet wijzigbaar (zoals bij
 * organisaties) — hij wordt als stabiele identifier gebruikt. Wordt
 * `featureKeys` weggelaten, dan blijft de feature-set ongemoeid; een lege array
 * leegt de set expliciet.
 */
export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Naam moet minimaal 2 tekens bevatten' })
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  featureKeys?: string[];
}
