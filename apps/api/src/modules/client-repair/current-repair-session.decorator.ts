import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { RepairSession } from '@prisma/client';
import type { RequestWithRepairSession } from './repair-session.guard';

/** Injecteert de door RepairSessionGuard gevalideerde sessie in de handler. */
export const CurrentRepairSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RepairSession => {
    const request = ctx.switchToHttp().getRequest<RequestWithRepairSession>();
    return request.repairSession;
  },
);
