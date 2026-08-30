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

  /** Same degrade-to-log/throw contract as sendOtpEmail. The caller
   *  (AuthService.requestPasswordReset) swallows a thrown error rather than
   *  surfacing it, since the endpoint's response must stay identical
   *  whether or not the email address exists. */
  async sendPasswordResetEmail(to: string, code: string): Promise<void> {
    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY not configured — password reset code for ${to} is ${code} (logged only, not emailed)`,
      );
      return;
    }

    const { error } = await this.resend.emails.send({
      from: this.fromEmail,
      to,
      subject: 'Reset your MediCore password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Reset your password</h2>
          <p>Someone requested a password reset for this account. Your code is:</p>
          <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px;">${code}</p>
          <p>This code expires in 15 minutes. If you didn't request this, you can ignore this email — your password won't change.</p>
        </div>
      `,
    });

    if (error) {
      this.logger.error(`Failed to send password reset email to ${to}: ${error.message} — code was ${code}`);
      throw new InternalServerErrorException('Failed to send password reset email');
    }
  }

  /**
   * Best-effort, unlike sendOtpEmail: this runs from a batch reminder job,
   * not a request a user is waiting on, so a failure here is logged and
   * swallowed rather than thrown — one bad recipient must not stop the rest
   * of the run or roll back the in-app notification/reminderSentAt stamp.
   */
  async sendAppointmentReminderEmail(
    to: string,
    params: { patientName: string; doctorName: string; scheduledAt: Date; mode: 'online' | 'in-person' },
  ): Promise<void> {
    const when = params.scheduledAt.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY not configured — reminder for ${to} (with Dr. ${params.doctorName} on ${when}) logged only, not emailed`,
      );
      return;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: 'Reminder: your upcoming MediCore appointment',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2>Upcoming appointment</h2>
            <p>Hi ${params.patientName}, this is a reminder about your ${params.mode === 'online' ? 'online' : 'in-person'} appointment with Dr. ${params.doctorName}:</p>
            <p style="font-size: 18px; font-weight: bold;">${when}</p>
            <p>If you need to reschedule or cancel, you can do so from your MediCore account.</p>
          </div>
        `,
      });

      if (error) {
        this.logger.error(`Failed to send appointment reminder email to ${to}: ${error.message}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send appointment reminder email to ${to}: ${(error as Error).message}`);
    }
  }
}
