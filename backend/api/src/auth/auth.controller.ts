import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from './types/authenticated-user.interface';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { GoogleProfilePayload } from './types/google-profile.interface';

interface AuthResponse {
  token: string;
  user: UserResponseDto;
}

interface MfaRequiredResponse {
  mfaRequired: true;
  mfaToken: string;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
    private readonly configService: ConfigService,
  ) {}

  /** Creates the account (unverified) and emails an OTP. No token yet — call verify-otp next. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  async signup(@Body() dto: SignupDto): Promise<{ email: string }> {
    const user = await this.authService.signupLocal(dto);
    return { email: user.email };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto): Promise<AuthResponse> {
    const user = await this.authService.verifyOtp(dto);
    const token = this.authService.issueAccessToken(user);
    return { token, user: new UserResponseDto(user) };
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('resend-otp')
  async resendOtp(@Body() dto: ResendOtpDto): Promise<{ message: string }> {
    await this.authService.resendOtp(dto.email);
    return { message: 'Verification code sent' };
  }

  /** Returns a real token directly, or -- for an MFA-enabled account -- a
   *  short-lived challenge to complete via POST /auth/mfa/verify instead. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto): Promise<AuthResponse | MfaRequiredResponse> {
    const user = await this.authService.loginLocal(dto);

    if (user.mfaEnabled) {
      return { mfaRequired: true, mfaToken: this.mfaService.issueChallenge(user.id) };
    }

    const token = this.authService.issueAccessToken(user);
    return { token, user: new UserResponseDto(user) };
  }

  /** Completes an MFA-gated login: a valid challenge token (from /login)
   *  plus a TOTP or backup code exchanges for a real access token. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('mfa/verify')
  async verifyMfa(@Body() dto: MfaVerifyDto): Promise<AuthResponse> {
    const user = await this.mfaService.verifyChallenge(dto.mfaToken, dto.code);
    const token = this.authService.issueAccessToken(user);
    return { token, user: new UserResponseDto(user) };
  }

  /** Always the same response, whether or not the email belongs to an
   *  account — see AuthService.requestPasswordReset for why. */
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    await this.authService.requestPasswordReset(dto.email);
    return { message: 'If an account exists for that email, a reset code has been sent' };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    await this.authService.resetPassword(dto);
    return { message: 'Password updated. You can now sign in.' };
  }

  /** Revokes every token issued so far for this user, current one included. */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() currentUser: AuthenticatedUser): Promise<void> {
    await this.authService.logout(currentUser.id);
  }

  /** Redirects the browser to Google's consent screen. */
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin(): void {
    // Intentionally empty — GoogleAuthGuard performs the redirect before this runs.
  }

  /** Google redirects here after consent. Issues a JWT and hands it to the frontend. */
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const clientUrl = this.configService.get<string>('clientUrl');

    try {
      const profile = req.user as GoogleProfilePayload;
      const user = await this.authService.validateGoogleUser(profile);
      const token = this.authService.issueAccessToken(user);

      this.logger.log(`OAuth success for ${user.email}`);
      res.redirect(`${clientUrl}/oauth/callback?token=${encodeURIComponent(token)}`);
    } catch (error) {
      this.logger.error('OAuth callback failed', error instanceof Error ? error.stack : undefined);
      res.redirect(`${clientUrl}/oauth/callback?error=oauth_failed`);
    }
  }
}
