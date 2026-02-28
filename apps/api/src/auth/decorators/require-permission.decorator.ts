import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

export function RequirePermission(permission: string) {
  return SetMetadata(REQUIRE_PERMISSION_KEY, permission);
}
