import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

/**
 * Query voor de lichte gebruikerslijst (`GET /users/selectable`) die door brede
 * rollen gebruikt wordt voor persoon-/team-pickers. Optioneel filterbaar op rol.
 */
export class ListSelectableUsersQueryDto {
  @ApiPropertyOptional({ enum: Role, description: 'Filter op gebruikers met deze rol/team' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
