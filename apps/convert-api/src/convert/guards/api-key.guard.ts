import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const expectedKey = this.config.get<string>('CONVERT_API_KEY');

    if (!expectedKey) {
      throw new UnauthorizedException('CONVERT_API_KEY is not configured');
    }

    if (apiKey !== expectedKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    return true;
  }
}
