import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateMedicineDto } from './dto/create-medicine.dto';
import type { MedicineResponse } from './pharmacy.mapper';
import { PharmacyService } from './pharmacy.service';

@Controller('pharmacy')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.PHARMACIST)
export class PharmacyController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  @Get('medicines')
  async findAll(): Promise<{ medicines: MedicineResponse[] }> {
    const medicines = await this.pharmacyService.findAll();
    return { medicines };
  }

  @Post('medicines')
  async create(@Body() dto: CreateMedicineDto): Promise<{ medicine: MedicineResponse }> {
    const medicine = await this.pharmacyService.create(dto);
    return { medicine };
  }

  @Patch('medicines/:id/stock')
  async adjustStock(
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ): Promise<{ medicine: MedicineResponse }> {
    const medicine = await this.pharmacyService.adjustStock(id, dto);
    return { medicine };
  }
}
