-- A bell notification kind for "your role changed" (#329). Idempotent: a deploy is not one transaction.
ALTER TYPE "InboxNotificationKind" ADD VALUE IF NOT EXISTS 'ACCESS_CHANGE';
