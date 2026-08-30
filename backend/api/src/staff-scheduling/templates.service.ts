import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { toPrismaShiftType } from './shifts.mapper';
import { TemplateResponse, toTemplateResponse } from './templates.mapper';

@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async findAll(): Promise<TemplateResponse[]> {
    const templates = await this.prisma.shiftTemplate.findMany({ orderBy: { name: 'asc' } });
    return templates.map(toTemplateResponse);
  }

  async create(dto: CreateTemplateDto, actorId: string): Promise<TemplateResponse> {
    const existing = await this.prisma.shiftTemplate.findUnique({ where: { name: dto.name } });

    if (existing) {
      throw new ConflictException('A template with this name already exists');
    }

    const template = await this.prisma.shiftTemplate.create({
      data: {
        name: dto.name,
        shiftType: toPrismaShiftType(dto.shiftType),
        startTime: dto.startTime,
        endTime: dto.endTime,
        description: dto.description,
      },
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.CREATE,
      entityType: 'ShiftTemplate',
      entityId: template.id,
      metadata: { name: template.name },
    });

    return toTemplateResponse(template);
  }

  async update(id: string, dto: UpdateTemplateDto, actorId: string): Promise<TemplateResponse> {
    const existing = await this.prisma.shiftTemplate.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Template not found');
    }

    if (dto.name && dto.name !== existing.name) {
      const nameTaken = await this.prisma.shiftTemplate.findUnique({ where: { name: dto.name } });

      if (nameTaken) {
        throw new ConflictException('A template with this name already exists');
      }
    }

    const template = await this.prisma.shiftTemplate.update({
      where: { id },
      data: {
        name: dto.name ?? existing.name,
        shiftType: dto.shiftType ? toPrismaShiftType(dto.shiftType) : existing.shiftType,
        startTime: dto.startTime ?? existing.startTime,
        endTime: dto.endTime ?? existing.endTime,
        description: dto.description ?? existing.description,
      },
    });

    await this.auditLog.log({
      actorId,
      action: AuditAction.UPDATE,
      entityType: 'ShiftTemplate',
      entityId: template.id,
      metadata: { before: existing },
    });

    return toTemplateResponse(template);
  }

  async remove(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.shiftTemplate.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Template not found');
    }

    await this.prisma.shiftTemplate.delete({ where: { id } });

    await this.auditLog.log({
      actorId,
      action: AuditAction.DELETE,
      entityType: 'ShiftTemplate',
      entityId: id,
      metadata: { name: existing.name },
    });
  }
}
