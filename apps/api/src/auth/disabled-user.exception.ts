import { ForbiddenException } from '@nestjs/common';

export const USER_DISABLED_CODE = 'USER_DISABLED';
export const USER_DISABLED_MESSAGE = 'User account is deactivated';

export class DisabledUserException extends ForbiddenException {
  constructor() {
    super({
      code: USER_DISABLED_CODE,
      message: USER_DISABLED_MESSAGE,
    });
  }
}
