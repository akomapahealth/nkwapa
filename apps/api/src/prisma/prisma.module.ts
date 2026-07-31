import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from './prisma.service';
import { PrismaRlsInterceptor } from './prisma-rls.interceptor';
import { JobTenantContextRunner } from './job-tenant-context.runner';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaRlsInterceptor,
    JobTenantContextRunner,
    {
      provide: APP_INTERCEPTOR,
      useExisting: PrismaRlsInterceptor,
    },
  ],
  exports: [PrismaService, JobTenantContextRunner],
})
export class PrismaModule {}
