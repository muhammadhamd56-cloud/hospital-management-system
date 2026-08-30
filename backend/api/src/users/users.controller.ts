import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaService } from '../auth/mfa.service';
import { MfaConfirmDto } from '../auth/dto/mfa-confirm.dto';
import { MfaDisableDto } from '../auth/dto/mfa-disable.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { SelectRoleDto } from './dto/select-role.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly mfaService: MfaService,
  ) {}

  @Get('me')
  async getProfile(@CurrentUser() currentUser: AuthenticatedUser): Promise<UserResponseDto> {
    const user = await this.usersService.findById(currentUser.id);
    return new UserResponseDto(user);
  }

  @Patch('me')
  async updateProfile(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.updateProfile(currentUser.id, dto);
    return new UserResponseDto(user);
  }

  @Patch('me/role')
  async selectRole(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: SelectRoleDto,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.selectRole(currentUser.id, dto.role);
    return new UserResponseDto(user);
  }

  @Patch('me/password')
  async setPassword(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: SetPasswordDto,
  ): Promise<UserResponseDto> {
    const user = await this.usersService.setPassword(currentUser.id, dto);
    return new UserResponseDto(user);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAccount(@CurrentUser() currentUser: AuthenticatedUser): Promise<void> {
    await this.usersService.deleteAccount(currentUser.id);
  }

  /** Starts (or restarts) MFA setup -- returns a QR code to scan. Not
   *  enabled until confirmMfa succeeds with a code from it. */
  @Post('me/mfa/setup')
  async setupMfa(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<{ secret: string; qrCodeDataUrl: string }> {
    return this.mfaService.startSetup(currentUser.id, currentUser.email);
  }

  /** Confirms MFA setup with a code from the authenticator app; enables it
   *  and returns one-time backup codes, shown to the user exactly once. */
  @Post('me/mfa/confirm')
  async confirmMfa(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: MfaConfirmDto,
  ): Promise<{ backupCodes: string[] }> {
    return this.mfaService.confirmSetup(currentUser.id, dto.code);
  }

  /** Disables MFA. Requires the caller's current password as re-auth. */
  @Post('me/mfa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableMfa(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() dto: MfaDisableDto,
  ): Promise<void> {
    await this.mfaService.disable(currentUser.id, dto.password);
  }
}
