import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ContextualHelpDto {
  /** moduleKey van de huidige view, bv. "quotes". */
  @IsOptional() @IsString() module?: string;
  /** Optionele vrije zoekterm (typt de gebruiker in het paneel). */
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}
