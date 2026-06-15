import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, IsOptional, MinLength } from 'class-validator';

export class ClientLoginDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() password: string;
}

export class ClientRegisterDto {
  @ApiProperty({ description: 'Token uit de uitnodigings-magic-link' })
  @IsString()
  magicLinkToken: string;

  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(8) password: string;
  @ApiProperty() @IsString() firstName: string;
  @ApiProperty() @IsString() lastName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() function?: string;
}

export class ValidateMagicLinkDto {
  @ApiProperty() @IsString() token: string;
}

export class ClientForgotPasswordDto {
  @ApiProperty() @IsEmail() email: string;
}

export class ClientResetPasswordDto {
  @ApiProperty() @IsString() token: string;
  @ApiProperty() @IsString() @MinLength(8) password: string;
}

export class ClientRefreshDto {
  @ApiProperty({ description: 'Refresh-token (client-realm)' })
  @IsString()
  refreshToken: string;
}
