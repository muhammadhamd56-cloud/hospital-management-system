import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { BedsService } from '../../beds/beds.service';
import { defineAction, type AiActionHandler } from '../tools/ai-action.types';
import { defineTool, type AiToolDefinition, type AiToolProvider } from '../tools/ai-tool.types';

const id = z.string().min(1).max(64);

const bedRow = z.object({
  id: z.string(),
  label: z.string(),
  department: z.string(),
  status: z.enum(['available', 'occupied', 'maintenance']),
  patientId: z.string().nullable(),
  patient: z.string().nullable(),
});

/**
 * Beds: availability, occupancy and discrepancy checks over BedsService.findAll
 * (the same data and admin scoping as the Beds page), plus a bed-assignment
 * proposal executed through BedsService.assign.
 */
@Injectable()
export class BedsAiTools implements AiToolProvider {
  readonly domain = 'beds' as const;

  constructor(private readonly beds: BedsService) {}

  tools(): AiToolDefinition[] {
    return [
      defineTool({
        name: 'beds.getAvailability',
        domain: 'beds',
        mode: 'read',
        permission: 'ai.read.beds',
        description:
          'List beds, optionally filtered by department name (partial match) and/or status. Returns at most `limit` rows plus exact totals.',
        input: z.object({
          department: z.string().max(80).optional(),
          status: z.enum(['available', 'occupied', 'maintenance']).optional(),
          limit: z.number().int().min(1).max(100).default(40),
        }),
        output: z.object({ total: z.number(), returned: z.number(), beds: z.array(bedRow) }),
        execute: async (args, ctx) => {
          const list = await this.beds.findAll(ctx.user);
          const department = args.department?.toLowerCase();
          const matching = list.beds.filter(
            (bed) =>
              (!department || bed.department.toLowerCase().includes(department)) &&
              (!args.status || bed.status === args.status),
          );
          const rows = matching.slice(0, args.limit).map((bed) => ({
            id: bed.id,
            label: bed.label,
            department: bed.department,
            status: bed.status,
            patientId: bed.patientId,
            patient: bed.patientId ? ctx.phi.patientName(bed.patientId, bed.patientName) : null,
          }));
          return { total: matching.length, returned: rows.length, beds: rows };
        },
      }),
      defineTool({
        name: 'beds.getOccupancy',
        domain: 'beds',
        mode: 'read',
        permission: 'ai.read.beds',
        description:
          'Current bed occupancy: hospital-wide and per-department counts of available/occupied/maintenance beds and occupancy rate. Point-in-time only (bed history is not recorded, so trends over time are not available).',
        input: z.object({}),
        output: z.object({
          total: z.number(),
          available: z.number(),
          occupied: z.number(),
          maintenance: z.number(),
          occupancyRate: z.number(),
          byDepartment: z.array(
            z.object({
              department: z.string(),
              total: z.number(),
              available: z.number(),
              occupied: z.number(),
              maintenance: z.number(),
              occupancyRate: z.number(),
            }),
          ),
        }),
        execute: async (_args, ctx) => {
          const list = await this.beds.findAll(ctx.user);
          const tally = (beds: typeof list.beds) => {
            const occupied = beds.filter((bed) => bed.status === 'occupied').length;
            const maintenance = beds.filter((bed) => bed.status === 'maintenance').length;
            const available = beds.filter((bed) => bed.status === 'available').length;
            const usable = beds.length - maintenance;
            return {
              total: beds.length,
              available,
              occupied,
              maintenance,
              occupancyRate: usable > 0 ? Math.round((occupied / usable) * 1000) / 10 : 0,
            };
          };
          const departments = [...new Set(list.beds.map((bed) => bed.department))].sort();
          return {
            ...tally(list.beds),
            byDepartment: departments.map((department) => ({
              department,
              ...tally(list.beds.filter((bed) => bed.department === department)),
            })),
          };
        },
      }),
      defineTool({
        name: 'beds.findDiscrepancies',
        domain: 'beds',
        mode: 'read',
        permission: 'ai.read.beds',
        description:
          'Check bed records for inconsistencies: beds marked occupied with no patient, or available/maintenance beds still linked to a patient.',
        input: z.object({}),
        output: z.object({
          checked: z.number(),
          issues: z.array(z.object({ bedId: z.string(), label: z.string(), department: z.string(), issue: z.string() })),
        }),
        execute: async (_args, ctx) => {
          const list = await this.beds.findAll(ctx.user);
          const issues = list.beds.flatMap((bed) => {
            if (bed.status === 'occupied' && !bed.patientId) {
              return [{ bedId: bed.id, label: bed.label, department: bed.department, issue: 'Marked occupied but no patient is linked' }];
            }
            if (bed.status !== 'occupied' && bed.patientId) {
              return [{ bedId: bed.id, label: bed.label, department: bed.department, issue: `Marked ${bed.status} but still linked to a patient` }];
            }
            return [];
          });
          return { checked: list.beds.length, issues };
        },
      }),
      defineTool({
        name: 'beds.prepareAssignment',
        domain: 'beds',
        mode: 'propose',
        permission: 'ai.propose.beds',
        description:
          'Prepare (not perform) assigning an available bed to a patient. Creates a proposal the admin must approve in the panel. Use real ids from beds.getAvailability and patients tools.',
        input: z.object({ bedId: id, patientId: id }),
        output: z.unknown(),
        execute: async (args) => ({ actionType: 'beds.assign', params: { bedId: args.bedId, patientId: args.patientId } }),
      }),
    ];
  }

  actions(): AiActionHandler[] {
    return [
      defineAction({
        type: 'beds.assign',
        domain: 'beds',
        schema: z.object({ bedId: id, patientId: id }).strict(),
        preview: async (params, user) => {
          const list = await this.beds.findAll(user);
          const bed = list.beds.find((candidate) => candidate.id === params.bedId);
          if (!bed) throw new BadRequestException('Bed not found');
          if (bed.status !== 'available') throw new BadRequestException(`Bed ${bed.label} is not available`);
          if (list.beds.some((candidate) => candidate.patientId === params.patientId)) {
            throw new BadRequestException('This patient is already assigned to a bed');
          }
          return `Assign bed ${bed.label} (${bed.department}) to patient ${params.patientId}.`;
        },
        execute: async (params, user) => {
          const bed = await this.beds.assign(user, params.bedId, params.patientId);
          return { bedId: bed.id, label: bed.label, status: bed.status };
        },
      }),
    ];
  }
}
