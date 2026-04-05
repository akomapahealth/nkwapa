import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

export interface PrismaRlsContext {
  requestId?: string;
  userId?: string | null;
  organizationId?: string | null;
  clinicIds?: string[];
  activeClinicId?: string | null;
  zoneCode?: string | null;
  isSystemAdmin?: boolean;
}

type PrismaLikeClient = PrismaClient | Prisma.TransactionClient;

type ActivePrismaContext = {
  client: Prisma.TransactionClient;
  rls: PrismaRlsContext;
};

type TransactionOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

const INTERNAL_PRISMA_KEYS = new Set([
  'applyRlsContext',
  'constructor',
  'getActiveClient',
  'getCurrentRlsContext',
  'onModuleDestroy',
  'onModuleInit',
  'rlsStorage',
  'withRlsContext',
  '$connect',
  '$disconnect',
  '$extends',
  '$on',
  '$transaction',
  '$use',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly rlsStorage = new AsyncLocalStorage<ActivePrismaContext>();

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL ?? '',
    });
    super({ adapter });

    return new Proxy(this, {
      get: (_, property) => {
        if (typeof property === 'symbol' || INTERNAL_PRISMA_KEYS.has(String(property))) {
          const value = Reflect.get(this, property, this);
          return typeof value === 'function' ? value.bind(this) : value;
        }

        const client = this.getActiveClient();
        const value = Reflect.get(client as object, property, client);
        return typeof value === 'function' ? value.bind(client) : value;
      },
      getPrototypeOf: () => Reflect.getPrototypeOf(this),
    }) as PrismaService;
  }

  async onModuleInit() {
    await super.$connect();
  }

  async onModuleDestroy() {
    await super.$disconnect();
  }

  getCurrentRlsContext(): PrismaRlsContext | null {
    return this.rlsStorage.getStore()?.rls ?? null;
  }

  async withRlsContext<T>(
    context: PrismaRlsContext,
    callback: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const active = this.rlsStorage.getStore();
    if (active) {
      return callback(active.client);
    }

    return super.$transaction(async (tx) => {
      await this.applyRlsContext(tx, context);
      return this.rlsStorage.run(
        {
          client: tx,
          rls: {
            ...context,
            clinicIds: [...new Set(context.clinicIds ?? [])],
          },
        },
        () => callback(tx),
      );
    });
  }

  async $transaction<T>(
    arg: Prisma.PrismaPromise<unknown>[] | ((prisma: Prisma.TransactionClient) => Promise<T>),
    options?: TransactionOptions,
  ): Promise<T> {
    const active = this.rlsStorage.getStore();
    if (active && typeof arg === 'function') {
      return arg(active.client);
    }

    if (typeof arg === 'function') {
      return super.$transaction(arg, options);
    }

    return (
      super.$transaction as unknown as (
        statements: Prisma.PrismaPromise<unknown>[],
        transactionOptions?: TransactionOptions,
      ) => Promise<T>
    )(arg, options);
  }

  private getActiveClient(): PrismaLikeClient {
    return this.rlsStorage.getStore()?.client ?? this;
  }

  private async applyRlsContext(client: Prisma.TransactionClient, context: PrismaRlsContext) {
    const clinicIds = [...new Set(context.clinicIds ?? [])].join(',');
    await client.$executeRaw`
      SELECT
        set_config('app.current_request_id', ${context.requestId ?? ''}, true),
        set_config('app.current_user_id', ${context.userId ?? ''}, true),
        set_config('app.current_organization_id', ${context.organizationId ?? ''}, true),
        set_config('app.current_clinic_ids', ${clinicIds}, true),
        set_config('app.current_active_clinic_id', ${context.activeClinicId ?? ''}, true),
        set_config('app.current_zone_code', ${context.zoneCode ?? ''}, true),
        set_config(
          'app.is_system_admin',
          ${context.isSystemAdmin ? 'true' : 'false'},
          true
        )
    `;
  }
}
