import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class BasePaginationQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  // Basis-cap is 200 — hét paginatie-contract met de portal, die voor
  // dropdown-/lijstdata overal `limit: 200` hanteert (B-305/WP-B6: met de oude
  // cap van 100 faalden 14 dropdown-call-sites stil met een 400).
  // Afwijken mag alleen bewust, met een comment in de eigen DTO. Huidige
  // gedocumenteerde afwijkingen:
  //   hoger : ListLocationsQueryDto (1000, kaartweergave),
  //           ListProjectsQueryDto & ListRequestsQueryDto (500, kanban)
  //   lager : ListAuditLogsQueryDto (50), SearchQueryDto (20),
  //           ContextualHelpDto (50)
  // De parametrische e2e (test/pagination-limit.e2e-spec.ts) bewaakt dat elk
  // gepagineerd endpoint `?limit=200` accepteert; afwijkingen staan daar expliciet.
  @ApiPropertyOptional({ default: 20, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Sorteerveld' })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
