import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { HttpExceptionFilter } from './http-exception.filter';

function buildHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = { method: 'POST', url: '/api/auth/login' };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  it('replaces ThrottlerException\'s raw class-name message with a friendly one', () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = buildHost();

    filter.catch(new ThrottlerException(), host);

    expect(status).toHaveBeenCalledWith(429);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'Too many attempts. Please wait a moment and try again.',
      errors: ['Too many attempts. Please wait a moment and try again.'],
    });
  });

  it('leaves every other HttpException\'s own message untouched', () => {
    const filter = new HttpExceptionFilter();
    const { host, status, json } = buildHost();

    filter.catch(new BadRequestException('Email is required'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'Email is required',
      errors: ['Email is required'],
    });
  });
});
