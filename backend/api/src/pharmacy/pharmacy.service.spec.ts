import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MedicineCategory, type Medicine } from '@prisma/client';
import { PharmacyService } from './pharmacy.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateMedicineDto } from './dto/create-medicine.dto';

function buildMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    id: 'med-1',
    name: 'Paracetamol',
    category: MedicineCategory.ANALGESIC,
    stock: 50,
    unit: 'tablets',
    price: 5.99,
    expiryDate: new Date('2027-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('PharmacyService', () => {
  let service: PharmacyService;
  let prisma: {
    medicine: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      medicine: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PharmacyService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(PharmacyService);
  });

  describe('findAll', () => {
    it('queries every medicine, ordered by name', async () => {
      prisma.medicine.findMany.mockResolvedValue([]);

      await service.findAll();

      expect(prisma.medicine.findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
    });

    it('maps rows to MedicineResponse, converting the category and expiry date', async () => {
      prisma.medicine.findMany.mockResolvedValue([buildMedicine({ category: MedicineCategory.VITAMINS_SUPPLEMENTS })]);

      const result = await service.findAll();

      expect(result).toEqual([
        {
          id: 'med-1',
          name: 'Paracetamol',
          category: 'Vitamins & Supplements',
          stock: 50,
          unit: 'tablets',
          price: 5.99,
          expiryDate: '2027-01-01T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('create', () => {
    it('creates a medicine, converting the client category to the Prisma enum', async () => {
      const dto: CreateMedicineDto = {
        name: 'Ibuprofen',
        category: 'Analgesic',
        stock: 100,
        unit: 'tablets',
        price: 3.5,
        expiryDate: '2027-06-01',
      };
      prisma.medicine.create.mockResolvedValue(buildMedicine({ name: 'Ibuprofen' }));

      const result = await service.create(dto);

      expect(prisma.medicine.create).toHaveBeenCalledWith({
        data: {
          name: 'Ibuprofen',
          category: MedicineCategory.ANALGESIC,
          stock: 100,
          unit: 'tablets',
          price: 3.5,
          expiryDate: new Date('2027-06-01'),
        },
      });
      expect(result.name).toBe('Ibuprofen');
    });
  });

  describe('adjustStock', () => {
    it('throws NotFoundException when the medicine does not exist', async () => {
      prisma.medicine.findUnique.mockResolvedValue(null);

      await expect(service.adjustStock('missing', { delta: 10 })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.medicine.update).not.toHaveBeenCalled();
    });

    it('increases stock for a positive delta (restock)', async () => {
      prisma.medicine.findUnique.mockResolvedValue(buildMedicine({ stock: 50 }));
      prisma.medicine.update.mockResolvedValue(buildMedicine({ stock: 70 }));

      const result = await service.adjustStock('med-1', { delta: 20 });

      expect(prisma.medicine.update).toHaveBeenCalledWith({ where: { id: 'med-1' }, data: { stock: 70 } });
      expect(result.stock).toBe(70);
    });

    it('decreases stock for a negative delta (dispense)', async () => {
      prisma.medicine.findUnique.mockResolvedValue(buildMedicine({ stock: 50 }));
      prisma.medicine.update.mockResolvedValue(buildMedicine({ stock: 40 }));

      await service.adjustStock('med-1', { delta: -10 });

      expect(prisma.medicine.update).toHaveBeenCalledWith({ where: { id: 'med-1' }, data: { stock: 40 } });
    });

    it('throws BadRequestException when the delta would take stock below zero', async () => {
      prisma.medicine.findUnique.mockResolvedValue(buildMedicine({ stock: 5 }));

      await expect(service.adjustStock('med-1', { delta: -10 })).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.medicine.update).not.toHaveBeenCalled();
    });

    it('allows a delta that brings stock to exactly zero', async () => {
      prisma.medicine.findUnique.mockResolvedValue(buildMedicine({ stock: 10 }));
      prisma.medicine.update.mockResolvedValue(buildMedicine({ stock: 0 }));

      const result = await service.adjustStock('med-1', { delta: -10 });

      expect(result.stock).toBe(0);
    });
  });
});
