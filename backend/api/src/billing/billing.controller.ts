import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.interface';
import { BillingService, InvoiceResponse } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.DOCTOR)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('invoices')
  async findAll(@CurrentUser() user: AuthenticatedUser): Promise<{ invoices: InvoiceResponse[] }> {
    const invoices = await this.billingService.findAll(user);
    return { invoices };
  }

  /** Patient-facing: only their own invoices -- overrides the class-level ADMIN/DOCTOR role. */
  @Get('invoices/me')
  @Roles(Role.PATIENT)
  async findMine(@CurrentUser() user: AuthenticatedUser): Promise<{ invoices: InvoiceResponse[] }> {
    const invoices = await this.billingService.findMine(user.id);
    return { invoices };
  }

  /** Starts an online payment for one of the caller's own invoices. */
  @Post('invoices/:id/checkout')
  @Roles(Role.PATIENT)
  async createCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ url: string }> {
    return this.billingService.createCheckoutSession(user.id, id);
  }

  @Post('invoices')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvoiceDto,
  ): Promise<{ invoice: InvoiceResponse }> {
    const invoice = await this.billingService.create(user, dto);
    return { invoice };
  }

  @Patch('invoices/:id/pay')
  async markPaid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ invoice: InvoiceResponse }> {
    const invoice = await this.billingService.markPaid(user, id);
    return { invoice };
  }

  @Get('revenue')
  revenueThisMonth(): Promise<{ amount: number }> {
    return this.billingService.revenueThisMonth();
  }
}
