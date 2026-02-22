import { PartialType } from '@nestjs/swagger';
import { CreatePriceTableDto } from './create-price-table.dto';

export class UpdatePriceTableDto extends PartialType(CreatePriceTableDto) {}
