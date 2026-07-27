import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    // WP-C1 (B-106): expliciet gooien i.p.v. `return false`, anders vult Nest de
    // Engelse default "Forbidden resource" in.
    if (!user || !requiredRoles.some((required) => user.roles.includes(required))) {
      throw new ForbiddenException('U heeft niet de juiste rol voor deze actie');
    }

    return true;
  }
}
