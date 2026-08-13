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
import type { Request, Response } from 'express';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from './types/authenticated-user.interface';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { GoogleProfilePayload } from './types/google-profile.interface';

interface AuthResponse {
  token: string;
  user: UserResponseDto;
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  /** Creates the account (unverified) and emails an OTP. No token yet — call verify-otp next. */
  @Post('signup')
  async signup(@Body() dto: SignupDto): Promise<{ email: string }> {
    const user = await this.authService.signupLocal(dto);
    return { email: user.email };
  }

  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto): Promise<AuthResponse> {
    const user = await this.authService.verifyOtp(dto);
    const token = this.authService.issueAccessToken(user);
    return { token, user: new UserResponseDto(user) };
  }

  @Post('resend-otp')
  async resendOtp(@Body() dto: ResendOtpDto): Promise<{ message: string }> {
    await this.authService.resendOtp(dto.email);
    return { message: 'Verification code sent' };
  }

  @Post('login')
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    const user = await this.authService.loginLocal(dto);
    const token = this.authService.issueAccessToken(user);
    return { token, user: new UserResponseDto(user) };
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
