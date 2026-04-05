import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from './prisma.service';
import { PrismaRlsInterceptor } from './prisma-rls.interceptor';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaRlsInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useExisting: PrismaRlsInterceptor,
    },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
