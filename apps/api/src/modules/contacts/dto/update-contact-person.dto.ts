import { PartialType } from '@nestjs/swagger';
import { CreateContactPersonDto } from './create-contact-person.dto';

export class UpdateContactPersonDto extends PartialType(CreateContactPersonDto) {}
