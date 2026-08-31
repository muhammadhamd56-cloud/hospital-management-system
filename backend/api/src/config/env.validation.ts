import { plainToInstance } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Min, validateSync } from 'class-validator';

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

  /** Optional so the app still boots without it — AssistantService throws a
   *  clear error only when someone actually opens the AI Assistant. */
  @IsOptional()
  @IsString()
  ANTHROPIC_API_KEY?: string;

  @IsOptional()
  @IsString()
  ANTHROPIC_MODEL?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return validated;
}
