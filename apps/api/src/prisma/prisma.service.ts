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
  systemReason?: string | null;
}

export type PrismaSystemContext = Omit<
  PrismaRlsContext,
  'clinicIds' | 'isSystemAdmin' | 'systemReason'
> & {
  systemReason: string;
};

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

export class InvalidSystemContextError extends Error {
  constructor() {
    super('System context requires a non-empty reason');
    this.name = 'InvalidSystemContextError';
  }
}

export class PrismaContextConflictError extends Error {
  constructor() {
    super('Cannot change Prisma tenant context inside an active context');
    this.name = 'PrismaContextConflictError';
  }
}

export class UnknownClinicContextError extends Error {
  constructor(clinicId: string) {
    super(`Cannot establish tenant context for unknown clinic: ${clinicId}`);
    this.name = 'UnknownClinicContextError';
  }
}

const INTERNAL_PRISMA_KEYS = new Set([
  'applyRlsContext',
  'assertCompatibleContext',
  'assertCompatibleClinicContext',
  'constructor',
  'getActiveClient',
  'getCurrentRlsContext',
  'normalizeRlsContext',
  'onModuleDestroy',
  'onModuleInit',
  'rlsStorage',
  'transactionWithContext',
  'withClinicContext',
  'withRlsContext',
  'withSystemContext',
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
    const normalizedContext = this.normalizeRlsContext(context);
    const active = this.rlsStorage.getStore();
    if (active) {
      this.assertCompatibleContext(active.rls, normalizedContext);
      return callback(active.client);
    }

    return this.transactionWithContext(async (tx) => {
      await this.applyRlsContext(tx, normalizedContext);
      return this.rlsStorage.run(
        {
          client: tx,
          rls: normalizedContext,
        },
        () => callback(tx),
      );
    });
  }

  async withClinicContext<T>(
    clinicId: string,
    context: Omit<PrismaRlsContext, 'activeClinicId' | 'clinicIds' | 'isSystemAdmin'>,
    callback: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const normalizedClinicId = clinicId.trim();
    if (!normalizedClinicId) {
      throw new UnknownClinicContextError(normalizedClinicId);
    }

    const active = this.rlsStorage.getStore();
    if (active) {
      this.assertCompatibleClinicContext(active.rls, normalizedClinicId, context);
      return callback(active.client);
    }

    const initialContext = this.normalizeRlsContext({
      ...context,
      organizationId: context.organizationId ?? null,
      zoneCode: context.zoneCode ?? null,
      clinicIds: [normalizedClinicId],
      activeClinicId: normalizedClinicId,
      isSystemAdmin: false,
      systemReason: null,
    });

    return this.withRlsContext(initialContext, async (tx) => {
      const clinic = await tx.clinic.findUnique({
        where: { id: normalizedClinicId },
        select: { organizationId: true, zoneCode: true },
      });
      if (!clinic) {
        throw new UnknownClinicContextError(normalizedClinicId);
      }

      const enrichedContext = this.normalizeRlsContext({
        ...initialContext,
        organizationId: context.organizationId ?? clinic.organizationId,
        zoneCode: context.zoneCode ?? clinic.zoneCode,
      });
      await this.applyRlsContext(tx, enrichedContext);

      const current = this.rlsStorage.getStore();
      if (current) {
        current.rls = enrichedContext;
      }

      return callback(tx);
    });
  }

  async withSystemContext<T>(
    context: PrismaSystemContext,
    callback: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const systemReason = context.systemReason.trim();
    if (!systemReason) {
      throw new InvalidSystemContextError();
    }

    return this.withRlsContext(
      {
        ...context,
        clinicIds: [],
        isSystemAdmin: true,
        systemReason,
      },
      callback,
    );
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

  private transactionWithContext<T>(
    callback: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return super.$transaction(callback);
  }

  private normalizeRlsContext(context: PrismaRlsContext): PrismaRlsContext {
    return {
      ...context,
      userId: context.userId ?? null,
      organizationId: context.organizationId ?? null,
      clinicIds: [...new Set(context.clinicIds ?? [])].sort(),
      activeClinicId: context.activeClinicId ?? null,
      zoneCode: context.zoneCode ?? null,
      isSystemAdmin: context.isSystemAdmin ?? false,
      systemReason: context.systemReason ?? null,
    };
  }

  private assertCompatibleContext(active: PrismaRlsContext, requested: PrismaRlsContext) {
    const normalizedActive = this.normalizeRlsContext(active);
    const sameClinicIds =
      normalizedActive.clinicIds?.length === requested.clinicIds?.length &&
      normalizedActive.clinicIds?.every(
        (clinicId, index) => clinicId === requested.clinicIds?.[index],
      );
    const isCompatible =
      normalizedActive.requestId === requested.requestId &&
      normalizedActive.userId === requested.userId &&
      normalizedActive.organizationId === requested.organizationId &&
      sameClinicIds &&
      normalizedActive.activeClinicId === requested.activeClinicId &&
      normalizedActive.zoneCode === requested.zoneCode &&
      normalizedActive.isSystemAdmin === requested.isSystemAdmin &&
      normalizedActive.systemReason === requested.systemReason;

    if (!isCompatible) {
      throw new PrismaContextConflictError();
    }
  }

  private assertCompatibleClinicContext(
    active: PrismaRlsContext,
    clinicId: string,
    context: Omit<PrismaRlsContext, 'activeClinicId' | 'clinicIds' | 'isSystemAdmin'>,
  ) {
    const requested = this.normalizeRlsContext({
      ...active,
      ...context,
      organizationId: context.organizationId ?? active.organizationId,
      zoneCode: context.zoneCode ?? active.zoneCode,
      clinicIds: [clinicId],
      activeClinicId: clinicId,
      isSystemAdmin: false,
      systemReason: null,
    });
    this.assertCompatibleContext(active, requested);
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
        set_config('app.system_context_reason', ${context.systemReason ?? ''}, true),
        set_config(
          'app.is_system_admin',
          ${context.isSystemAdmin ? 'true' : 'false'},
          true
        )
    `;
  }
}
