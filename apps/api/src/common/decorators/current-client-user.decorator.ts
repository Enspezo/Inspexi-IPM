import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CurrentClientUserData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  function: string | null;
  phone: string | null;
}

export const CurrentClientUser = createParamDecorator(
  (data: keyof CurrentClientUserData | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as CurrentClientUserData | undefined;
    return data ? user?.[data] : user;
  },
);
