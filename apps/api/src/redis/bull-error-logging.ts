import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { WorkerHost } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { attachRedisErrorLogging } from '../common/redis';

/**
 * Gives every queue and worker an `error` listener (#199).
 *
 * BullMQ re-emits each connection error from its queues and workers. With no listener it prints
 * the whole error to stderr on every reconnect attempt, from every connection, for as long as
 * Redis is down. Listening here routes them through the same rate-limited log as the other
 * clients. Workers exist by now: `@nestjs/bullmq` creates them during module init.
 */
@Injectable()
export class BullErrorLogging implements OnApplicationBootstrap {
  constructor(private readonly discovery: DiscoveryService) {}

  onApplicationBootstrap(): void {
    for (const { instance } of this.discovery.getProviders()) {
      if (instance instanceof Queue) {
        attachRedisErrorLogging(instance, `queue:${instance.name}`);
      } else if (instance instanceof WorkerHost) {
        const worker = this.workerOf(instance);
        if (worker) attachRedisErrorLogging(worker, `worker:${worker.name}`);
      }
    }
  }

  private workerOf(host: WorkerHost) {
    try {
      return host.worker;
    } catch {
      // The getter throws for a host whose worker was never created.
      return null;
    }
  }
}
