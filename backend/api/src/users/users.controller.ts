import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { setAuthCookies } from '../auth/auth-cookies';
import type { AppConfig } from '../config/configuration';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DemoAccountGuard } from '../demo/demo-account.guard';
import { MfaService } from '../auth/mfa.service';
import { MfaConfirmDto } from '../auth/dto/mfa-confirm.dto';
import { MfaDisableDto } from '../auth/dto/mfa-disable.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AllowUnapproved } from '../common/decorators/allow-unapproved.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { SelectRoleDto } from './dto/select-role.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

/** Every route here is the caller's own account, so it stays reachable while
 *  a doctor/staff account awaits approval (they need it to see their status). */
@Controller('users')
@UseGuards(JwtAuthGuard)
@AllowUnapproved()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly mfaService: MfaService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('me')
  async getProfile(@CurrentUser() currentUser: AuthenticatedUser): Promise<UserResponseDto> {
    const user = await this.usersService.findById(currentUser.id);
    return new UserResponseDto(user);
  }

  @Patch('me')
  @UseGuards(DemoAccountGuard)
  async updateProfile(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.updateProfile(currentUser.id, dto);
    return new UserResponseDto(user);
  }

  @Patch('me/role')
  @UseGuards(DemoAccountGuard)
  async selectRole(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: SelectRoleDto,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.selectRole(currentUser.id, dto.role);
    return new UserResponseDto(user);
  }

  @Patch('me/password')
  @UseGuards(DemoAccountGuard)
  async setPassword(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: SetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.setPassword(currentUser.id, dto);
    // setPassword bumped tokenVersion (signing out every other session); keep
    // this one alive with a fresh token pair.
    setAuthCookies(res, this.authService.issueTokens(user), this.configService.get<AppConfig['cookies']>('cookies') as AppConfig['cookies']);
    return new UserResponseDto(user);
  }

  @Delete('me')
  @UseGuards(DemoAccountGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@CurrentUser() currentUser: AuthenticatedUser): Promise<void> {
    await this.usersService.deleteAccount(currentUser.id);
  }

  /** Starts (or restarts) MFA setup -- returns a QR code to scan. Not
   *  enabled until confirmMfa succeeds with a code from it. */
  @Post('me/mfa/setup')
  @UseGuards(DemoAccountGuard)
  async setupMfa(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<{ secret: string; qrCodeDataUrl: string }> {
    return this.mfaService.startSetup(currentUser.id, currentUser.email);
  }

  /** Confirms MFA setup with a code from the authenticator app; enables it
   *  and returns one-time backup codes, shown to the user exactly once. */
  @Post('me/mfa/confirm')
  @UseGuards(DemoAccountGuard)
  async confirmMfa(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: MfaConfirmDto,
  ): Promise<{ backupCodes: string[] }> {
    return this.mfaService.confirmSetup(currentUser.id, dto.code);
  }

  /** Disables MFA. Requires the caller's current password as re-auth. */
  @Post('me/mfa/disable')
  @UseGuards(DemoAccountGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableMfa(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: MfaDisableDto,
  ): Promise<void> {
    await this.mfaService.disable(currentUser.id, dto.password);
  }
}
