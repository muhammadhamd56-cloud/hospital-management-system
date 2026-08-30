import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ShiftType, type ShiftTemplate } from '@prisma/client';
import { TemplatesService } from './templates.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

const ACTOR_ID = 'admin-1';

function buildTemplate(overrides: Partial<ShiftTemplate> = {}): ShiftTemplate {
  return {
    id: 'template-1',
    name: 'Morning Shift',
    shiftType: ShiftType.MORNING,
    startTime: '08:00',
    endTime: '16:00',
    description: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('TemplatesService', () => {
  let service: TemplatesService;
  let prisma: {
    shiftTemplate: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; delete: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      shiftTemplate: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(TemplatesService);
  });

  describe('create', () => {
    it('rejects a duplicate template name', async () => {
      prisma.shiftTemplate.findUnique.mockResolvedValue(buildTemplate());

      await expect(
        service.create({ name: 'Morning Shift', shiftType: 'morning', startTime: '08:00', endTime: '16:00' }, ACTOR_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.shiftTemplate.create).not.toHaveBeenCalled();
    });

    it('creates a template', async () => {
      prisma.shiftTemplate.findUnique.mockResolvedValue(null);
      prisma.shiftTemplate.create.mockResolvedValue(buildTemplate());

      const result = await service.create(
        { name: 'Morning Shift', shiftType: 'morning', startTime: '08:00', endTime: '16:00' },
        ACTOR_ID,
      );

      expect(result.shiftType).toBe('morning');
      expect(result.startTime).toBe('08:00');
    });
  });

  describe('update', () => {
    it('throws NotFoundException when the template does not exist', async () => {
      prisma.shiftTemplate.findUnique.mockResolvedValue(null);

      await expect(service.update('missing', {}, ACTOR_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects renaming to a name already used by another template', async () => {
      prisma.shiftTemplate.findUnique
        .mockResolvedValueOnce(buildTemplate())
        .mockResolvedValueOnce(buildTemplate({ id: 'template-2', name: 'Night Shift' }));

      await expect(service.update('template-1', { name: 'Night Shift' }, ACTOR_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.shiftTemplate.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('throws NotFoundException when the template does not exist', async () => {
      prisma.shiftTemplate.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing', ACTOR_ID)).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.shiftTemplate.delete).not.toHaveBeenCalled();
    });

    it('deletes an existing template', async () => {
      prisma.shiftTemplate.findUnique.mockResolvedValue(buildTemplate());

      await service.remove('template-1', ACTOR_ID);

      expect(prisma.shiftTemplate.delete).toHaveBeenCalledWith({ where: { id: 'template-1' } });
    });
  });
});
