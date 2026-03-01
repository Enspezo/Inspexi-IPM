import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class DeleteUserDto {
  @ApiProperty({ description: 'ID van de gebruiker om records aan over te dragen' })
  @IsUUID()
  transferToUserId: string;
}
