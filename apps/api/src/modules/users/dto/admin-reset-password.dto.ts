import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AdminResetPasswordDto {
  @ApiProperty({ example: 'NieuwWachtwoord123!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Wachtwoord moet minimaal 8 tekens bevatten' })
  newPassword: string;
}
