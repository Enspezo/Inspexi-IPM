import { PartialType } from '@nestjs/swagger';
import { CreateContactAddressDto } from './create-contact-address.dto';

export class UpdateContactAddressDto extends PartialType(CreateContactAddressDto) {}
