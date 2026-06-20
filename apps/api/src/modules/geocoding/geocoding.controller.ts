import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { CurrentUser } from '@/common';
import { GeocodingService } from './geocoding.service';

@ApiTags('geocoding')
@Controller('geocoding')
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Get('suggest')
  @ApiOperation({ summary: 'Zoek adressen via PDOK Locatieserver' })
  @ApiQuery({ name: 'q', description: 'Zoekterm (min. 2 tekens)', required: true })
  suggest(@Query('q') q: string) {
    if (!q || q.trim().length < 2) return [];
    return this.geocodingService.suggest(q.trim());
  }

  @Get('lookup')
  @ApiOperation({ summary: 'Haal adresdetails op via PDOK Locatieserver' })
  @ApiQuery({ name: 'id', description: 'PDOK adres-ID', required: true })
  lookup(@Query('id') id: string, @CurrentUser() user: User) {
    if (!id) return null;
    return this.geocodingService.lookup(id, {
      operation: 'LOOKUP',
      orgId: user.orgId,
      userId: user.id,
    });
  }
}
