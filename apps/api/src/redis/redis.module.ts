import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { RedisService } from './redis.service';
import { BullErrorLogging } from './bull-error-logging';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [RedisService, BullErrorLogging],
  exports: [RedisService],
})
export class RedisModule {}
