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
import type { User } from '@prisma/client';
import { UserResponseDto } from '../users/dto/user-response.dto';
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
import { isLockedDemoAccount } from '../demo/demo-account.guard';
import type { GoogleProfilePayload } from './types/google-profile.interface';
import type { AppConfig } from '../config/configuration';
import { ACCESS_COOKIE, clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './auth-cookies';

/** The tokens themselves travel only as httpOnly cookies (see auth-cookies.ts),
 *  never in the body, so page JavaScript -- including injected script -- can't read them. */
interface AuthResponse {
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
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const user = await this.authService.verifyOtp(dto);
    return this.startSession(user, res);
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('resend-otp')
  async resendOtp(@Body() dto: ResendOtpDto): Promise<{ message: string }> {
    await this.authService.resendOtp(dto.email);
    return { message: 'Verification code sent' };
  }

  /** Starts a session directly, or -- for an MFA-enabled account -- returns a
   *  short-lived challenge to complete via POST /auth/mfa/verify instead. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse | MfaRequiredResponse> {
    const user = await this.authService.loginLocal(dto);

    if (user.mfaEnabled) {
      return { mfaRequired: true, mfaToken: this.mfaService.issueChallenge(user.id) };
    }

    return this.startSession(user, res);
  }

  /** Completes an MFA-gated login: a valid challenge token (from /login)
   *  plus a TOTP or backup code exchanges for a real access token. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('mfa/verify')
  async verifyMfa(
    @Body() dto: MfaVerifyDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const user = await this.mfaService.verifyChallenge(dto.mfaToken, dto.code);
    return this.startSession(user, res);
  }

  /** Swaps the refresh cookie for a new access + refresh pair. The frontend
   *  calls this when a request 401s because the short-lived access token expired. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<AuthResponse> {
    try {
      const { user, tokens } = await this.authService.refreshSession(
        req.cookies?.[REFRESH_COOKIE] as string | undefined,
      );
      setAuthCookies(res, tokens, this.cookieConfig());
      return { user: new UserResponseDto(user) };
    } catch (error) {
      // A dead refresh cookie is useless -- drop both so the browser stops sending them.
      clearAuthCookies(res, this.cookieConfig());
      throw error;
    }
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
  /** Deliberately not behind JwtAuthGuard: an idle user's access cookie has
   *  usually expired, and a guarded logout would 401 before clearing the
   *  still-valid refresh cookie -- leaving them signed in on the next visit.
   *  Always succeeds and always clears both cookies. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const bearer = req.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    const owner = await this.authService.findSessionOwner({
      refreshToken: req.cookies?.[REFRESH_COOKIE] as string | undefined,
      accessToken: (req.cookies?.[ACCESS_COOKIE] as string | undefined) ?? bearer,
    });

    // A shared demo login has many visitors at once -- revoking would sign them all out.
    if (owner && !isLockedDemoAccount(this.configService, owner.email)) {
      await this.authService.logout(owner.id);
    }
    clearAuthCookies(res, this.cookieConfig());
  }

  /** Redirects the browser to Google's consent screen. */
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin(): void {
    // Intentionally empty — GoogleAuthGuard performs the redirect before this runs.
  }

  /** Google redirects here after consent. Sets the session cookies and sends the browser back to the frontend. */
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const clientUrl = this.configService.get<string>('clientUrl');

    try {
      const profile = req.user as GoogleProfilePayload;
      const user = await this.authService.validateGoogleUser(profile);
      setAuthCookies(res, this.authService.issueTokens(user), this.cookieConfig());

      this.logger.log(`OAuth success for ${user.email}`);
      // No token in the URL any more -- it would land in browser history and
      // server logs. The cookies set above are the session.
      res.redirect(`${clientUrl}/oauth/callback`);
    } catch (error) {
      this.logger.error('OAuth callback failed', error instanceof Error ? error.stack : undefined);
      res.redirect(`${clientUrl}/oauth/callback?error=oauth_failed`);
    }
  }

  private startSession(user: User, res: Response): AuthResponse {
    setAuthCookies(res, this.authService.issueTokens(user), this.cookieConfig());
    return { user: new UserResponseDto(user) };
  }

  private cookieConfig(): AppConfig['cookies'] {
    return this.configService.get<AppConfig['cookies']>('cookies') as AppConfig['cookies'];
  }
}
