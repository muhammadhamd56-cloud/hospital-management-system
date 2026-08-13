// jest.mock must be declared before importing EmailService (which imports
// 'resend' itself) — ts-jest does not hoist jest.mock calls above imports
// the way babel-jest does, so the mock factory has to come first textually.
const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailService } from './email.service';

describe('EmailService', () => {
  let service: EmailService;
  let configService: { get: jest.Mock };

  async function buildService(values: Record<string, string | undefined>) {
    configService = { get: jest.fn((key: string) => values[key]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService, { provide: ConfigService, useValue: configService }],
    }).compile();

    return module.get(EmailService);
  }

  beforeEach(() => {
    mockSend.mockReset();
    (Resend as unknown as jest.Mock).mockClear();
  });

  describe('when RESEND_API_KEY is configured', () => {
    beforeEach(async () => {
      service = await buildService({
        'email.resendApiKey': 're_test_key',
        'email.fromEmail': 'no-reply@medicore.test',
      });
    });

    it('constructs the Resend client with the configured API key', () => {
      expect(Resend).toHaveBeenCalledWith('re_test_key');
    });

    describe('sendOtpEmail', () => {
      it('sends an email via Resend with the recipient, subject, and code embedded in the html', async () => {
        mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

        await service.sendOtpEmail('ada@example.com', '123456');

        expect(mockSend).toHaveBeenCalledTimes(1);
        const payload = mockSend.mock.calls[0][0];
        expect(payload.from).toBe('no-reply@medicore.test');
        expect(payload.to).toBe('ada@example.com');
        expect(payload.subject).toBe('Your MediCore verification code');
        expect(payload.html).toContain('123456');
      });

      it('resolves with no value on success', async () => {
        mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

        await expect(service.sendOtpEmail('ada@example.com', '123456')).resolves.toBeUndefined();
      });

      it('throws InternalServerErrorException when Resend returns an error, without letting the raw Resend error escape', async () => {
        mockSend.mockResolvedValue({
          data: null,
          error: { name: 'validation_error', message: 'Invalid recipient' },
        });

        await expect(service.sendOtpEmail('ada@example.com', '123456')).rejects.toBeInstanceOf(
          InternalServerErrorException,
        );
      });

      it('throws InternalServerErrorException when the Resend call itself rejects', async () => {
        mockSend.mockRejectedValue(new Error('network error'));

        await expect(service.sendOtpEmail('ada@example.com', '123456')).rejects.toThrow('network error');
      });
    });
  });

  describe('when RESEND_API_KEY is not configured', () => {
    beforeEach(async () => {
      service = await buildService({
        'email.resendApiKey': undefined,
        'email.fromEmail': 'no-reply@medicore.test',
      });
    });

    it('does not construct a Resend client', () => {
      expect(Resend).not.toHaveBeenCalled();
    });

    it('degrades to logging the code instead of throwing, and never calls Resend', async () => {
      await expect(service.sendOtpEmail('ada@example.com', '123456')).resolves.toBeUndefined();
      expect(mockSend).not.toHaveBeenCalled();
    });
  });
});
