import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ClinicId = createParamDecorator(
  (paramKey: string | undefined, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const key = paramKey ?? 'clinicId';
    return request.params?.[key] ?? request.body?.[key] ?? request.query?.[key];
  }
);
