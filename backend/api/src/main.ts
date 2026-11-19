import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import helmet from 'helmet';
import * as express from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { csrfProtection } from './common/middleware/csrf.middleware';
import { createAccessLogMiddleware, isAccessLogEnabled } from './common/middleware/access-log.middleware';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

// Only reports errors (no performance tracing) -- undefined DSN makes this a
// no-op client, so it's safe to call unconditionally in every environment.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  tracesSampleRate: 0,
});

async function bootstrap(): Promise<void> {
  // Body parsing is set up manually below instead of Nest's default,
  // because the Stripe webhook needs the untouched raw request bytes to
  // verify its signature -- once express.json() has consumed the stream
  // for a path, there's no getting the raw bytes back.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  // Behind Render's load balancer (and Vercel's /api rewrite) every request
  // arrives from a proxy's address. Without this, req.ip -- what the rate
  // limiter keys on -- is that proxy for every user, so one client's failed
  // logins would throttle everyone. Set to the number of proxies in front
  // of the app; leaving it at 0 locally means X-Forwarded-For is ignored.
  const trustProxyHops = configService.get<number>('trustProxyHops') ?? 0;
  if (trustProxyHops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  }

  app.use('/api/billing/webhooks/stripe', express.raw({ type: 'application/json' }));
  // Raised from Express's 100kb default so chat messages can carry a compressed image data URL.
  app.use(express.json({ limit: '3mb' }));
  app.use(express.urlencoded({ extended: true, limit: '3mb' }));

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  if (isAccessLogEnabled()) {
    // Before csrfProtection, so CSRF rejections get an access-log line and request id too.
    app.use(createAccessLogMiddleware());
  }
  app.use(csrfProtection);
  app.enableCors({
    origin: configService.get<string>('clientUrl'),
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  // A full map of every endpoint and payload is a gift to an attacker and
  // of no use to the app's own users, so it's only served outside production.
  const serveApiDocs = process.env.NODE_ENV !== 'production';
  if (serveApiDocs) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Hospital Management System API')
      .setDescription('REST API for the Hospital Management System backend')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, swaggerDocument);
  }

  // Lets Prisma disconnect and in-flight requests finish when Render sends SIGTERM on a redeploy.
  app.enableShutdownHooks();

  const port = configService.get<number>('port') ?? 3000;
  await app.listen(port);
  logger.log(`Server listening on http://localhost:${port}/api`);
  if (serveApiDocs) {
    logger.log(`API docs available at http://localhost:${port}/api/docs`);
  }
}

bootstrap();
