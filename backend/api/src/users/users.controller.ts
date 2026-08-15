import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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
  constructor(private readonly usersService: UsersService) {}

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
}
