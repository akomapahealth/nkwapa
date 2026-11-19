import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  evaluateRlsEnforcement,
  reportRlsEnforcement,
  resolveApplicationDatabaseUrl,
  rlsEnforcementMode,
  RlsNotEnforcedError,
} from './rls-enforcement';

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
  /** Work to run once this context's transaction has committed; see `afterCommit`. */
  afterCommit: AfterCommitWork[];
};

type AfterCommitWork = { key: string | null; work: () => Promise<unknown> };

/**
 * Columns no query returns unless it selects them by name (#336).
 *
 * A patient's follow-up tier may only reach people holding FOLLOW_UP.READ, but many endpoints
 * return whole Patient rows (the portal among them). Omitting the columns at the client makes a
 * new endpoint safe by default: the follow-up code selects them explicitly where it needs them.
 * The static `Patient` type still lists them, so read them only from a query that selects them.
 */
export const GLOBALLY_OMITTED = {
  patient: { currentRiskTier: true, currentRiskAssessmentId: true },
} as const;

export type TransactionOptions = {
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
  'afterCommit',
  'applyRlsContext',
  'assertCompatibleContext',
  'assertCompatibleClinicContext',
  'constructor',
  'detachFromRlsContext',
  'getActiveClient',
  'getCurrentRlsContext',
  'logger',
  'normalizeRlsContext',
  'onModuleDestroy',
  'onModuleInit',
  'rlsStorage',
  'runAfterCommit',
  'transactionWithContext',
  'verifyRlsEnforcement',
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
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const adapter = new PrismaPg({
      connectionString: resolveApplicationDatabaseUrl(process.env),
    });
    super({ adapter, omit: GLOBALLY_OMITTED });

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
    await this.verifyRlsEnforcement();
  }

  /**
   * Confirm at boot that the declared row-level-security policies can actually apply to this
   * connection. See rls-enforcement.ts for why a declared policy is not a enforced one.
   */
  private async verifyRlsEnforcement(): Promise<void> {
    try {
      const [probe] = await super.$queryRaw<
        Array<{ role: string; isSuperuser: boolean; bypassesRls: boolean }>
      >`SELECT current_user::text AS role, rolsuper AS "isSuperuser", rolbypassrls AS "bypassesRls"
        FROM pg_roles WHERE rolname = current_user`;

      const unforced = await super.$queryRaw<Array<{ table: string }>>`
        SELECT c.relname::text AS "table"
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relrowsecurity AND NOT c.relforcerowsecurity
        ORDER BY c.relname`;

      const status = evaluateRlsEnforcement({
        role: probe?.role ?? 'unknown',
        isSuperuser: Boolean(probe?.isSuperuser),
        bypassesRls: Boolean(probe?.bypassesRls),
        unforcedTables: unforced.map((row) => row.table),
      });

      reportRlsEnforcement(status, rlsEnforcementMode(process.env), this.logger);
    } catch (error) {
      if (error instanceof RlsNotEnforcedError) throw error;
      // A probe failure must not take the service down on its own; it is reported and the
      // configured mode still governs whether a known-bad database is fatal.
      this.logger.warn(
        `Could not verify row level security enforcement: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
    options?: TransactionOptions,
  ): Promise<T> {
    const normalizedContext = this.normalizeRlsContext(context);
    const active = this.rlsStorage.getStore();
    if (active) {
      this.assertCompatibleContext(active.rls, normalizedContext);
      return callback(active.client);
    }

    const afterCommit: ActivePrismaContext['afterCommit'] = [];
    const result = await this.transactionWithContext(async (tx) => {
      await this.applyRlsContext(tx, normalizedContext);
      return this.rlsStorage.run(
        {
          client: tx,
          rls: normalizedContext,
          afterCommit,
        },
        () => callback(tx),
      );
    }, options);
    await this.runAfterCommit(afterCommit);
    return result;
  }

  /**
   * Run `work` once the current request's transaction has committed, outside any tenant context,
   * so it sees the committed rows and can open its own (#336). A failure is logged and never
   * reaches the caller: the write it follows has already been saved. Nothing runs if the
   * transaction rolls back. With no transaction open, it runs now.
   *
   * The request waits for it, so it suits a handful of queries, not a network call. Work queued
   * twice under one `key` in the same transaction runs once.
   */
  async afterCommit(work: () => Promise<unknown>, key: string | null = null): Promise<void> {
    const active = this.rlsStorage.getStore();
    if (active) {
      if (key === null || !active.afterCommit.some((queued) => queued.key === key)) {
        active.afterCommit.push({ key, work });
      }
      return;
    }
    await this.runAfterCommit([{ key, work }]);
  }

  private async runAfterCommit(queue: ActivePrismaContext['afterCommit']): Promise<void> {
    // A callback may queue more work (it opens its own context); drain until empty.
    while (queue.length > 0) {
      const { work } = queue.shift()!;
      await this.rlsStorage
        .exit(() => work())
        .catch((error: unknown) => {
          this.logger.warn(
            `After-commit work failed: ${error instanceof Error ? error.name : 'unknown error'}`,
          );
        });
    }
  }

  /**
   * @param options Only for work that cannot be split and has no side effect outside the
   * database, such as a long read. Never raise the timeout to cover a network call: move the call
   * out of the transaction instead (see JobTenantContextRunner.runClinicJobSteps).
   */
  async withClinicContext<T>(
    clinicId: string,
    context: Omit<PrismaRlsContext, 'activeClinicId' | 'clinicIds' | 'isSystemAdmin'>,
    callback: (client: Prisma.TransactionClient) => Promise<T>,
    options?: TransactionOptions,
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

    return this.withRlsContext(
      initialContext,
      async (tx) => {
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
      },
      options,
    );
  }

  /**
   * Run `callback` outside any request's tenant context, so it can open its own (#250). For work
   * that must not join the caller's transaction: it neither sees the caller's uncommitted rows nor
   * is rolled back with them, and a failure in it cannot fail the caller.
   */
  detachFromRlsContext<T>(callback: () => T): T {
    return this.rlsStorage.exit(callback);
  }

  async withSystemContext<T>(
    context: PrismaSystemContext,
    callback: (client: Prisma.TransactionClient) => Promise<T>,
    options?: TransactionOptions,
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
      options,
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
    options?: TransactionOptions,
  ): Promise<T> {
    return super.$transaction(callback, options);
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
