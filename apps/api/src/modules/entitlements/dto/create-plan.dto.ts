import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @MinLength(2, { message: 'Naam moet minimaal 2 tekens bevatten' })
  @MaxLength(60)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9]+$/, {
    message: 'Slug mag alleen kleine letters en cijfers bevatten (geen koppeltekens)',
  })
  @MaxLength(40)
  slug!: string;

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

  /**
   * Feature-keys die dit plan standaard aanzet. Onbekende keys worden in de
   * service geweigerd (validatie tegen FEATURE_CATALOG).
   */
  @IsArray()
  @IsString({ each: true })
  featureKeys!: string[];
}
