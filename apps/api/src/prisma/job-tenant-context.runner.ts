import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

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

  async runClinicJob<T>(
    context: ClinicJobContext,
    callback: (client: Prisma.TransactionClient) => Promise<T>,
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

    return this.prisma.withClinicContext(
      tenant.clinicId,
      { requestId, userId: tenant.userId },
      callback,
    );
  }

  async runSystemJob<T>(
    context: SystemJobContext,
    callback: (client: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    this.warn('system_job_context', context, {
      systemReason: context.systemReason,
    });
    return this.prisma.withSystemContext(
      {
        requestId: this.getRequestId(context.jobId, context.resourceId),
        userId: context.userId ?? null,
        systemReason: context.systemReason,
      },
      callback,
    );
  }

  private normalizeTenant(tenant: JobTenant | null | undefined): JobTenant | null {
    if (!tenant) {
      return null;
    }

    const clinicId = tenant.clinicId.trim();
    if (!clinicId) {
      return null;
    }
    return {
      clinicId,
      userId: tenant.userId?.trim() || null,
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
