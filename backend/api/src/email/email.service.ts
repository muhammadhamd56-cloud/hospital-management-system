import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('email.resendApiKey');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.fromEmail = this.configService.get<string>('email.fromEmail') as string;
  }

  /**
   * Degrades to logging the code instead of throwing when no API key is
   * configured, so local dev keeps working before RESEND_API_KEY is set —
   * the code is still visible (in the server log) to complete signup.
   */
  async sendOtpEmail(to: string, code: string): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`RESEND_API_KEY not configured — OTP for ${to} is ${code} (logged only, not emailed)`);
      return;
    }

    const { error } = await this.resend.emails.send({
      from: this.fromEmail,
      to,
      subject: 'Your MediCore verification code',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Verify your email</h2>
          <p>Your verification code is:</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px;">${code}</p>
          <p>This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
        </div>
      `,
    });

    if (error) {
      // Also log the code on failure (e.g. Resend's sandbox mode rejecting
      // a recipient other than the account owner's own address) so it's
      // still recoverable in dev/staging even though a real API key is
      // configured — mirrors the no-key-configured fallback above.
      this.logger.error(`Failed to send OTP email to ${to}: ${error.message} — code was ${code}`);
      throw new InternalServerErrorException('Failed to send verification email');
    }
  }
}
