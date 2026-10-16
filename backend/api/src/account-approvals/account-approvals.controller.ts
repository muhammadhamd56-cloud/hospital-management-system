import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AccountApprovalsService, type AccountRequestResponse } from './account-approvals.service';
import { ListAccountRequestsDto, ReviewAccountDto } from './dto/review-account.dto';

/** Admin review queue for self-registered doctor and staff accounts. */
@Controller('account-approvals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AccountApprovalsController {
  constructor(private readonly accountApprovalsService: AccountApprovalsService) {}

  @Get()
  async list(@Query() query: ListAccountRequestsDto): Promise<{ requests: AccountRequestResponse[] }> {
    const requests = await this.accountApprovalsService.list(query.status ?? 'pending');
    return { requests };
  }

  @Patch(':userId')
  async review(
    @CurrentUser() admin: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: ReviewAccountDto,
  ): Promise<{ request: AccountRequestResponse }> {
    const request = await this.accountApprovalsService.review(admin, userId, dto);
    return { request };
  }
}
