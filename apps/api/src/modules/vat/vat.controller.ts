import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { VatService } from './vat.service';

// VAT-lookup is a CRM proxy (contact VAT validation) — gate it behind the CRM
// feature like the sibling geocoding/kvk proxies instead of leaving it open to
// any authenticated user (SEC-14).
@ApiTags('vat')
@RequiresFeature('BASIS_CRM')
@Controller('vat')
export class VatController {
  constructor(private readonly vatService: VatService) {}

  @Get('check')
  @ApiOperation({ summary: 'Controleer een BTW-nummer via VIES' })
  @ApiQuery({
    name: 'vatNumber',
    description: 'BTW-nummer inclusief landcode (bijv. NL123456789B01)',
    required: true,
  })
  check(@Query('vatNumber') vatNumber: string) {
    if (!vatNumber || vatNumber.trim().length < 4) {
      throw new BadRequestException('Geef een BTW-nummer op');
    }
    return this.vatService.check(vatNumber.trim());
  }
}
