import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap(): Promise<void> {
  // Body parsing is set up manually below instead of Nest's default,
  // because the Stripe webhook needs the untouched raw request bytes to
  // verify its signature -- once express.json() has consumed the stream
  // for a path, there's no getting the raw bytes back.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const logger = new Logger('Bootstrap');
  const configService = app.get(ConfigService);

  app.use('/api/billing/webhooks/stripe', express.raw({ type: 'application/json' }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use(helmet());
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Hospital Management System API')
    .setDescription('REST API for the Hospital Management System backend')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  const port = configService.get<number>('port') ?? 3001;
  await app.listen(port);
  logger.log(`Server listening on http://localhost:${port}/api`);
  logger.log(`API docs available at http://localhost:${port}/api/docs`);
}

bootstrap();
