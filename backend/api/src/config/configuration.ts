import { loadAdminAiConfig, type AdminAiConfig } from '../admin-ai/admin-ai.config';

export interface AppConfig {
  port: number;
  clientUrl: string;
  /** Public portfolio demo: shared demo accounts are locked down (see src/demo/). */
  demoMode: boolean;
  /** Proxies in front of the app (Render LB = 1, plus Vercel's /api rewrite = 2). 0 = trust none. */
  trustProxyHops: number;
  jwt: {
    secret: string;
    expiresIn: string;
    refreshSecret: string;
    refreshExpiresIn: string;
  };
  cookies: {
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
  };
  google: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
  email: {
    resendApiKey: string | undefined;
    fromEmail: string;
  };
  stripe: {
    secretKey: string | undefined;
    webhookSecret: string | undefined;
  };
  assistant: {
    anthropicApiKey: string | undefined;
    model: string;
  };
  /** Admin AI Copilot (src/admin-ai). Every flag defaults to the safe value. */
  adminAi: AdminAiConfig;
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  demoMode: process.env.DEMO_MODE === 'true',
  trustProxyHops: parseInt(process.env.TRUST_PROXY_HOPS ?? '0', 10),
  jwt: {
    secret: process.env.JWT_SECRET as string,
    // Short-lived on purpose: the refresh token keeps the session alive, so a
    // leaked access token is only useful for minutes.
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    // Falls back to JWT_SECRET so existing deploys keep booting; JwtStrategy
    // rejects refresh-shaped payloads either way, but a distinct secret is better.
    refreshSecret: (process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET) as string,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  cookies: {
    // Browsers only accept SameSite=None on Secure cookies.
    secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SAMESITE === 'none',
    sameSite: (process.env.COOKIE_SAMESITE as 'lax' | 'strict' | 'none' | undefined) ?? 'lax',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID as string,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL as string,
  },
  email: {
    resendApiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
  assistant: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
  },
  adminAi: loadAdminAiConfig(process.env),
});
