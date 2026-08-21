import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from './prisma.service';
import { PrismaRlsInterceptor } from './prisma-rls.interceptor';
import { JobTenantContextRunner } from './job-tenant-context.runner';
import { RequestContextInterceptor } from '../common/request-context.interceptor';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaRlsInterceptor,
    RequestContextInterceptor,
    JobTenantContextRunner,
    // Registered first so the tenant context, and anything it logs, can already name the request
    // that asked for it.
    {
      provide: APP_INTERCEPTOR,
      useExisting: RequestContextInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useExisting: PrismaRlsInterceptor,
    },
  ],
  exports: [PrismaService, JobTenantContextRunner],
})
export class PrismaModule {}
