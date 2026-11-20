import { plainToInstance } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Min, validateSync } from 'class-validator';
import { parseMfaEncryptionKey } from '../auth/mfa-secret-crypto';

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN!: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_SECRET?: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_EXPIRES_IN?: string;

  /** Leave unset (lax) when the frontend reaches the API on the same site,
   *  e.g. through a proxy/rewrite. Set to "none" only for a cross-site API. */
  @IsOptional()
  @IsIn(['lax', 'strict', 'none'])
  COOKIE_SAMESITE?: string;

  /** How many reverse proxies sit in front of the app; sets Express 'trust proxy'. */
  @IsOptional()
  @IsInt()
  @Min(0)
  TRUST_PROXY_HOPS?: number;

  /** "true" for the public portfolio demo -- locks down the shared demo accounts. */
  @IsOptional()
  @IsIn(['true', 'false'])
  DEMO_MODE?: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_ID!: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_SECRET!: string;

  @IsUrl({ require_tld: false })
  GOOGLE_CALLBACK_URL!: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  CLIENT_URL?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  PORT?: number;

  /** Optional so the app still boots without it — EmailService throws a clear
   *  error only when something actually tries to send an email. */
  @IsOptional()
  @IsString()
  RESEND_API_KEY?: string;

  @IsOptional()
  @IsString()
  RESEND_FROM_EMAIL?: string;

  /** Optional so the app still boots without it — StripeService throws a
   *  clear error only when a patient actually tries to pay online. */
  @IsOptional()
  @IsString()
  STRIPE_SECRET_KEY?: string;

  /** Verifies webhook requests are really from Stripe. Required alongside
   *  STRIPE_SECRET_KEY for online payments to actually confirm as paid. */
  @IsOptional()
  @IsString()
  STRIPE_WEBHOOK_SECRET?: string;

  /** Optional so the app still boots without it -- Sentry.init() no-ops
   *  when the DSN is undefined, so errors just go unreported. */
  @IsOptional()
  @IsString()
  SENTRY_DSN?: string;

  @IsOptional()
  @IsString()
  SENTRY_ENVIRONMENT?: string;

  /** Encrypts User.mfaSecret at rest (AES-256-GCM): 32 bytes as base64 or
   *  64 hex characters. Required when NODE_ENV=production -- see mfaKeyErrors. */
  @IsOptional()
  @IsString()
  MFA_ENCRYPTION_KEY?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });
  const details = [
    ...errors.map((error) => Object.values(error.constraints ?? {}).join(', ')),
    ...mfaKeyErrors(config),
  ];

  if (details.length > 0) {
    throw new Error(`Invalid environment configuration:\n${details.join('\n')}`);
  }

  return validated;
}

/** Required in production, optional elsewhere, always well-formed when set.
 *  Never echoes the key itself -- only whether it is missing or malformed. */
export function mfaKeyErrors(config: Record<string, unknown>): string[] {
  const raw = typeof config.MFA_ENCRYPTION_KEY === 'string' ? config.MFA_ENCRYPTION_KEY.trim() : '';

  if (!raw) {
    return config.NODE_ENV === 'production'
      ? ['MFA_ENCRYPTION_KEY is required in production (32 bytes, as base64 or 64 hex characters)']
      : [];
  }

  try {
    parseMfaEncryptionKey(raw);
    return [];
  } catch (error) {
    return [(error as Error).message];
  }
}
