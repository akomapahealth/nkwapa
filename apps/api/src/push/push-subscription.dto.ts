import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

// Push services hand out https endpoints only; anything else is not a browser's subscription.
const HTTPS_URL = /^https:\/\/[^\s]+$/;
const BASE64URL = /^[A-Za-z0-9_-]+=*$/;

/** One browser's subscription, as PushSubscription.toJSON() gives it, flattened (#250). */
export class SavePushSubscriptionDto {
  @IsString()
  @MaxLength(1024)
  @Matches(HTTPS_URL, { message: 'endpoint must be an https URL' })
  endpoint!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  @Matches(BASE64URL, { message: 'p256dh must be base64url' })
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(BASE64URL, { message: 'auth must be base64url' })
  auth!: string;
}

export class RemovePushSubscriptionDto {
  @IsString()
  @MaxLength(1024)
  endpoint!: string;
}
