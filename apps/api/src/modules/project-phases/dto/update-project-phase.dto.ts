import { PartialType } from '@nestjs/swagger';
import { CreateProjectPhaseDto } from './create-project-phase.dto';

/**
 * Alle Create-velden worden optioneel bij een PATCH (naam, status, locatie,
 * contactpersoon, datums, budget). `completedAt` wordt server-side afgeleid uit
 * de statuswissel naar/van AFGEROND (§12.4.5) en is dus geen invoerveld.
 */
export class UpdateProjectPhaseDto extends PartialType(CreateProjectPhaseDto) {}
