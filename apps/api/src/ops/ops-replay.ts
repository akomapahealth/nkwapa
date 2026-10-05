import { BadRequestException } from '@nestjs/common';
import { todayInTimeZone } from '@nkwapa/db';

/**
 * How far ahead of the server a device clock may run before its timestamp is refused.
 *
 * Phones drift by seconds and occasionally by a minute or two. Anything further ahead is a clock
 * that is simply wrong, and back-dating a shift to it would put the record in the future.
 */
export const OPS_REPLAY_CLOCK_SKEW_MS = 5 * 60_000;

/**
 * The instant a replayed clinic operation is recorded at.
 *
 * An offline check-in carries the time it really happened on the device, so the board shows when
 * the patient arrived rather than when the connection came back. That is only honest within the
 * clinic day it happened: the Today board, assignments and shift rosters are all scoped to one
 * clinic day, and a check-in landing tomorrow would appear on a board nobody is looking at while
 * the patient has long gone. Older actions are refused rather than silently re-dated.
 *
 * A device a little ahead of the server is clamped to the server's now; one far ahead is refused.
 */
export function resolveReplayTime(occurredAt: Date, now: Date, timeZone: string): Date {
  if (Number.isNaN(occurredAt.getTime())) {
    throw new BadRequestException({
      code: 'INVALID_OPS_TIME_ORDER',
      message: 'The time this action happened is not a valid date.',
    });
  }
  if (occurredAt.getTime() - now.getTime() > OPS_REPLAY_CLOCK_SKEW_MS) {
    throw new BadRequestException({
      code: 'INVALID_OPS_TIME_ORDER',
      message: 'This device’s clock is ahead of the clinic’s. Check the date and time settings.',
    });
  }
  if (todayInTimeZone(timeZone, occurredAt) !== todayInTimeZone(timeZone, now)) {
    throw new BadRequestException({
      code: 'OPS_REPLAY_EXPIRED',
      message: 'This action was recorded on an earlier clinic day and can no longer be applied.',
    });
  }
  return occurredAt.getTime() > now.getTime() ? now : occurredAt;
}
