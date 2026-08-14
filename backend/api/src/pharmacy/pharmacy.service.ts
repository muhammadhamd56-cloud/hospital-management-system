import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { CreateMedicineDto } from './dto/create-medicine.dto';
import { MedicineResponse, toMedicineResponse, toPrismaMedicineCategory } from './pharmacy.mapper';

@Injectable()
export class PharmacyService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<MedicineResponse[]> {
    const medicines = await this.prisma.medicine.findMany({ orderBy: { name: 'asc' } });
    return medicines.map(toMedicineResponse);
  }

  async create(dto: CreateMedicineDto): Promise<MedicineResponse> {
    const medicine = await this.prisma.medicine.create({
      data: {
        name: dto.name,
        category: toPrismaMedicineCategory(dto.category),
        stock: dto.stock,
        unit: dto.unit,
        price: dto.price,
        expiryDate: new Date(dto.expiryDate),
      },
    });

    return toMedicineResponse(medicine);
  }

  /** Positive delta restocks, negative dispenses. Rejects a delta that would take stock below zero. */
  async adjustStock(id: string, dto: AdjustStockDto): Promise<MedicineResponse> {
    const medicine = await this.prisma.medicine.findUnique({ where: { id } });

    if (!medicine) {
      throw new NotFoundException('Medicine not found');
    }

    const newStock = medicine.stock + dto.delta;

    if (newStock < 0) {
      throw new BadRequestException('Not enough stock for this adjustment');
    }

    const updated = await this.prisma.medicine.update({
      where: { id },
      data: { stock: newStock },
    });

    return toMedicineResponse(updated);
  }
}
