import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { KvkService } from './kvk.service';

@ApiTags('kvk')
@Controller('kvk')
export class KvkController {
  constructor(private readonly kvkService: KvkService) {}

  @Get('zoeken')
  @ApiOperation({ summary: 'Zoek bedrijven in het KvK Handelsregister' })
  @ApiQuery({
    name: 'q',
    description: 'Handelsnaam (min. 3 tekens) of KvK-nummer (8 cijfers)',
    required: true,
  })
  search(@Query('q') q: string) {
    if (!q || q.trim().length < 2) return [];
    return this.kvkService.search(q.trim());
  }

  @Get(':kvkNummer')
  @ApiOperation({ summary: 'Haal basisprofiel op uit KvK Handelsregister' })
  getProfile(@Param('kvkNummer') kvkNummer: string) {
    return this.kvkService.getProfile(kvkNummer);
  }
}
