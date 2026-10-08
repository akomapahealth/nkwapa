import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, type TransactionOptions } from './prisma.service';

export type JobTenant = {
  clinicId: string;
  userId: string | null;
};

export type UnresolvedTenantPolicy = 'discard' | 'fail';

export type ClinicJobContext = {
  queueName: string;
  jobId?: string | number | null;
  resourceId: string;
  tenant?: JobTenant | null;
  legacy: {
    resolveTenant: () => Promise<JobTenant | null>;
    systemReason: string;
  };
  unresolvedTenant: UnresolvedTenantPolicy;
};

export type SystemJobContext = {
  queueName: string;
  jobId?: string | number | null;
  resourceId: string;
  systemReason: string;
  userId?: string | null;
};

/**
 * Run one short transaction under the job's tenant context.
 *
 * A job that calls something outside the database (an SMS or email provider, GitHub) uses one
 * step to claim its row, makes the call with no transaction open, and a second step to record the
 * outcome. The claim commits before the call, so a slow call can never roll it back, and the
 * outcome is recorded whatever the call cost. Reads and writes outside a step have no tenant
 * context, so row-level security returns nothing: everything that touches the database belongs in
 * a step.
 */
export type JobStep = <T>(
  callback: (client: Prisma.TransactionClient) => Promise<T>,
  options?: TransactionOptions,
) => Promise<T>;

export class UnresolvedJobTenantError extends Error {
  constructor(queueName: string, resourceId: string) {
    super(`Unable to resolve tenant for ${queueName} job resource ${resourceId}`);
    this.name = 'UnresolvedJobTenantError';
  }
}

@Injectable()
export class JobTenantContextRunner {
  private readonly logger = new Logger(JobTenantContextRunner.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The whole job in one transaction. Only for jobs that call nothing outside the database. */
  async runClinicJob<T>(
    context: ClinicJobContext,
    callback: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T | undefined> {
    return this.runClinicJobSteps(context, (step) => step(callback));
  }

  /**
   * The job as a series of short transactions, each under the same clinic context. The callback
   * itself runs outside any transaction; see `JobStep`.
   */
  async runClinicJobSteps<T>(
    context: ClinicJobContext,
    callback: (step: JobStep) => Promise<T>,
  ): Promise<T | undefined> {
    const requestId = this.getRequestId(context.jobId, context.resourceId);
    let tenant = this.normalizeTenant(context.tenant);

    if (!tenant) {
      this.warn('legacy_job_tenant_resolution', context, {
        systemReason: context.legacy.systemReason,
      });
      tenant = this.normalizeTenant(
        await this.runSystemJob(
          {
            queueName: context.queueName,
            jobId: context.jobId,
            resourceId: context.resourceId,
            systemReason: context.legacy.systemReason,
          },
          () => context.legacy.resolveTenant(),
        ),
      );
    }

    if (!tenant) {
      this.warn('unresolved_job_tenant', context, {
        policy: context.unresolvedTenant,
      });
      if (context.unresolvedTenant === 'fail') {
        throw new UnresolvedJobTenantError(context.queueName, context.resourceId);
      }
      return undefined;
    }

    const resolved = tenant;
    return callback((stepCallback, options) =>
      this.prisma.withClinicContext(
        resolved.clinicId,
        { requestId, userId: resolved.userId },
        stepCallback,
        options,
      ),
    );
  }

  async runSystemJob<T>(
    context: SystemJobContext,
    callback: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.runSystemJobSteps(context, (step) => step(callback));
  }

  /** `runClinicJobSteps` for work that crosses clinics. */
  async runSystemJobSteps<T>(
    context: SystemJobContext,
    callback: (step: JobStep) => Promise<T>,
  ): Promise<T> {
    this.warn('system_job_context', context, {
      systemReason: context.systemReason,
    });
    const systemContext = {
      requestId: this.getRequestId(context.jobId, context.resourceId),
      userId: context.userId ?? null,
      systemReason: context.systemReason,
    };
    return callback((stepCallback, options) =>
      this.prisma.withSystemContext(systemContext, stepCallback, options),
    );
  }

  /**
   * A step under one clinic's context, for a system job that has found work in that clinic (a
   * sweep) and records the outcome there rather than with system-wide rights.
   */
  clinicStep(clinicId: string, requestId: string): JobStep {
    return (stepCallback, options) =>
      this.prisma.withClinicContext(clinicId, { requestId, userId: null }, stepCallback, options);
  }

  /**
   * A job's data is whatever JSON was in Redis when it was queued, not what the type says. A blank
   * or non-string clinic id is treated as absent, so the job resolves its tenant from its record
   * (or meets its unresolved policy) instead of crashing on `.trim()` and burning its retries.
   */
  private normalizeTenant(tenant: JobTenant | null | undefined): JobTenant | null {
    if (!tenant) {
      return null;
    }

    const clinicId = trimmedString(tenant.clinicId);
    if (!clinicId) {
      return null;
    }
    return {
      clinicId,
      userId: trimmedString(tenant.userId),
    };
  }

  private getRequestId(jobId: string | number | null | undefined, resourceId: string) {
    return String(jobId ?? resourceId);
  }

  private warn(
    event: string,
    context: Pick<ClinicJobContext, 'queueName' | 'jobId' | 'resourceId'>,
    details: Record<string, string>,
  ) {
    this.logger.warn(
      JSON.stringify({
        event,
        queueName: context.queueName,
        jobId: context.jobId == null ? null : String(context.jobId),
        resourceId: context.resourceId,
        ...details,
      }),
    );
  }
}

function trimmedString(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() || null : null;
}
