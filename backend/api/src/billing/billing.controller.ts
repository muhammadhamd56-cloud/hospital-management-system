import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { BillingService, InvoiceResponse } from './billing.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('invoices')
  async findAll(): Promise<{ invoices: InvoiceResponse[] }> {
    const invoices = await this.billingService.findAll();
    return { invoices };
  }

  @Post('invoices')
  async create(@Body() dto: CreateInvoiceDto): Promise<{ invoice: InvoiceResponse }> {
    const invoice = await this.billingService.create(dto);
    return { invoice };
  }

  @Patch('invoices/:id/pay')
  async markPaid(@Param('id') id: string): Promise<{ invoice: InvoiceResponse }> {
    const invoice = await this.billingService.markPaid(id);
    return { invoice };
  }

  @Get('revenue')
  revenueThisMonth(): Promise<{ amount: number }> {
    return this.billingService.revenueThisMonth();
  }
}
