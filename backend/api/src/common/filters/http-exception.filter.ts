import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface NestErrorBody {
  message?: string | string[];
  error?: string;
}

/**
 * Catches everything (HttpException and unexpected errors alike) and shapes it
 * into the app's consistent error envelope: { success: false, message, errors }.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const body = exception instanceof HttpException ? exception.getResponse() : null;
    const parsedBody = typeof body === 'object' && body !== null ? (body as NestErrorBody) : null;

    const message =
      exception instanceof HttpException ? exception.message : 'Internal server error';

    const errors = parsedBody?.message
      ? Array.isArray(parsedBody.message)
        ? parsedBody.message
        : [parsedBody.message]
      : [];

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status}: ${message}`);
    }

    response.status(status).json({
      success: false,
      message,
      errors,
    });
  }
}
