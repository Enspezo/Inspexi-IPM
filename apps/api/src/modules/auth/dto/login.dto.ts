import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@inspexi-demo.nl' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @MinLength(8)
  password: string;

  // Optional device-id from the client (e.g. the inspector PWA). Accepted but
  // not required; staff login does not bind a device. Prevents a 400 from the
  // global ValidationPipe (forbidNonWhitelisted) when a client sends it.
  @ApiPropertyOptional({ description: 'Optioneel device-id van de client' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
