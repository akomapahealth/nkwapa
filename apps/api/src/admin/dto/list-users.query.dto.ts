import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ToSanitizedString } from '../../common/validation';

/**
 * Query parameters for `GET /admin/users`.
 *
 * A class rather than loose `@Query('x')` parameters so the global pipe's `forbidNonWhitelisted`
 * refuses anything undeclared, and so `organizationId` is validated before it reaches a query.
 */
export class ListUsersQueryDto {
  /** `active`, `inactive` or `all`. Checked by the service, which owns the error message. */
  @IsOptional()
  @ToSanitizedString({ maxLength: 16 })
  @IsString()
  status?: string;

  /** Users holding a role in one organization's clinics. */
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
