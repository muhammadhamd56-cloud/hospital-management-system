import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { BedsService } from '../../beds/beds.service';
import { BillingService } from '../../billing/billing.service';
import { LaboratoryService } from '../../laboratory/laboratory.service';
import { PatientsService } from '../../patients/patients.service';
import { defineTool, type AiToolDefinition, type AiToolProvider } from '../tools/ai-tool.types';
import { countBy } from './ai-tool-helpers';

const id = z.string().min(1).max(64);

const patientRow = z.object({
  id: z.string(),
  patient: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  registeredAt: z.string(),
  appointmentCount: z.number(),
  lastVisit: z.string().nullable(),
});

/**
 * Patients: administrative lookups only, over PatientsService (same admin
 * scoping as the Patients page). Never returns diagnoses, visit reasons,
 * notes, prescriptions, specialties seen or lab results. Every call is audited.
 */
@Injectable()
export class PatientsAiTools implements AiToolProvider {
  readonly domain = 'patients' as const;

  constructor(
    private readonly patients: PatientsService,
    private readonly beds: BedsService,
    private readonly billing: BillingService,
    private readonly laboratory: LaboratoryService,
  ) {}

  tools(): AiToolDefinition[] {
    return [
      defineTool({
        name: 'patients.searchPatients',
        domain: 'patients',
        mode: 'read',
        permission: 'ai.read.patients',
        audit: true,
        description:
          'Find patients by a case-insensitive substring of their full name or patient id (matching runs server-side on real names). ' +
          'Returns id, display name, registration date, appointment count and last visit, newest registrations first; at most `limit` rows plus the exact match count. ' +
          'When PHI sharing is off the display name is a pseudonym ("Patient P-XXXXXX") and email/phone are omitted -- refer to patients by id/pseudonym.',
        input: z.object({
          query: z.string().trim().min(1).max(100).optional(),
          limit: z.number().int().min(1).max(100).default(20),
        }),
        output: z.object({ total: z.number(), matching: z.number(), returned: z.number(), patients: z.array(patientRow) }),
        execute: async (args, ctx) => {
          const all = await this.patients.findAll(ctx.user);
          const query = args.query?.toLowerCase();
          const matching = query
            ? all.filter((p) => p.fullName.toLowerCase().includes(query) || p.id.toLowerCase().includes(query))
            : all;
          const rows = matching.slice(0, args.limit).map((p) => ({
            id: p.id,
            patient: ctx.phi.patientName(p.id, p.fullName),
            email: ctx.phi.contact(p.email),
            phone: ctx.phi.contact(p.phone),
            registeredAt: p.joinedAt,
            appointmentCount: p.appointmentCount,
            lastVisit: p.lastVisit,
          }));
          return { total: all.length, matching: matching.length, returned: rows.length, patients: rows };
        },
      }),
      defineTool({
        name: 'patients.getAdministrativeSummary',
        domain: 'patients',
        mode: 'read',
        permission: 'ai.read.patients',
        audit: true,
        description:
          'Administrative summary of one patient by id: registration date; appointment counts by status, first/last past (non-cancelled) visit and next scheduled date, number of distinct doctors; ' +
          'current bed (label, department) if admitted; invoice counts by status with total billed/paid/outstanding; lab test counts by status. ' +
          'Contains NO clinical content (no reasons, diagnoses, notes, prescriptions, test names or results). Name/contact follow the PHI policy.',
        input: z.object({ patientId: id }),
        output: z.object({
          id: z.string(),
          patient: z.string(),
          email: z.string().optional(),
          phone: z.string().optional(),
          registeredAt: z.string(),
          appointments: z.object({
            total: z.number(),
            byStatus: z.record(z.string(), z.number()),
            firstVisit: z.string().nullable(),
            lastVisit: z.string().nullable(),
            nextScheduled: z.string().nullable(),
            distinctDoctors: z.number(),
          }),
          bed: z.object({ label: z.string(), department: z.string() }).nullable(),
          invoices: z.object({
            total: z.number(),
            byStatus: z.record(z.string(), z.number()),
            billed: z.number(),
            paid: z.number(),
            outstanding: z.number(),
          }),
          labTests: z.object({ total: z.number(), byStatus: z.record(z.string(), z.number()) }),
        }),
        execute: async (args, ctx) => {
          const patient = await this.patients.findOne(ctx.user, args.patientId);
          const [beds, invoices, labTests] = await Promise.all([
            this.beds.findAll(ctx.user),
            this.billing.findAll(ctx.user),
            this.laboratory.findAll(ctx.user),
          ]);
          const now = Date.now();
          // Visits = non-cancelled appointments that have already started (ISO strings sort chronologically).
          const visits = patient.appointments
            .filter((a) => a.status !== 'cancelled' && new Date(a.scheduledAt).getTime() <= now)
            .map((a) => a.scheduledAt)
            .sort();
          const upcoming = patient.appointments
            .filter((a) => a.status === 'scheduled' && new Date(a.scheduledAt).getTime() > now)
            .map((a) => a.scheduledAt)
            .sort();
          const bed = beds.beds.find((b) => b.patientId === patient.id);
          const ownInvoices = invoices.filter((invoice) => invoice.patientId === patient.id);
          const billable = ownInvoices.filter((invoice) => invoice.status !== 'cancelled');
          const ownTests = labTests.filter((test) => test.patientId === patient.id);
          return {
            id: patient.id,
            patient: ctx.phi.patientName(patient.id, patient.fullName),
            email: ctx.phi.contact(patient.email),
            phone: ctx.phi.contact(patient.phone),
            registeredAt: patient.joinedAt,
            appointments: {
              total: patient.appointments.length,
              byStatus: countBy(patient.appointments, (a) => a.status),
              firstVisit: visits[0] ?? null,
              lastVisit: visits[visits.length - 1] ?? null,
              nextScheduled: upcoming[0] ?? null,
              distinctDoctors: new Set(patient.appointments.map((a) => a.doctorId)).size,
            },
            bed: bed ? { label: bed.label, department: bed.department } : null,
            invoices: {
              total: ownInvoices.length,
              byStatus: countBy(ownInvoices, (invoice) => invoice.status),
              billed: round2(billable.reduce((sum, invoice) => sum + invoice.amount, 0)),
              paid: round2(billable.reduce((sum, invoice) => sum + invoice.amountPaid, 0)),
              outstanding: round2(billable.reduce((sum, invoice) => sum + invoice.remaining, 0)),
            },
            labTests: { total: ownTests.length, byStatus: countBy(ownTests, (test) => test.status) },
          };
        },
      }),
    ];
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

