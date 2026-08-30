import type { ShiftTemplate } from '@prisma/client';
import type { ClientShiftType } from './dto/create-shift.dto';
import { toClientShiftType } from './shifts.mapper';

export interface TemplateResponse {
  id: string;
  name: string;
  shiftType: ClientShiftType;
  startTime: string;
  endTime: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toTemplateResponse(template: ShiftTemplate): TemplateResponse {
  return {
    id: template.id,
    name: template.name,
    shiftType: toClientShiftType(template.shiftType),
    startTime: template.startTime,
    endTime: template.endTime,
    description: template.description,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
  };
}
