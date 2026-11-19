import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { BillingService, type InvoiceResponse } from '../../billing/billing.service';
import { roundMoney } from '../../common/money.util';
import { defineTool, type AiToolDefinition, type AiToolProvider } from '../tools/ai-tool.types';
import { checkRange, daysInRange, inRange, isoDate } from './group-b.shared';

const period = z
  .object({ from: isoDate, to: isoDate })
  .superRefine((value, ctx) => checkRange(value.from, value.to, ctx));

const periodTotals = z.object({
  from: z.string(),
  to: z.string(),
  invoiceCount: z.number(),
  invoiced: z.number(),
  cancelledCount: z.number(),
  paymentCount: z.number(),
  collected: z.number(),
  refundedOfCollected: z.number(),
  netCollected: z.number(),
});

const change = z.object({ absolute: z.number(), percent: z.number().nullable() });

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function pctChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return Math.round(((to - from) / Math.abs(from)) * 1000) / 10;
}

/**
 * Billing: read-only financial summaries over BillingService (overview,
 * revenueThisMonth, monthlyRevenueTrend, findAll) -- the same figures and
 * admin scoping as the Billing page. Deliberately no actions: the copilot
 * never creates invoices, records payments, refunds or cancels.
 */
@Injectable()
export class BillingAiTools implements AiToolProvider {
  readonly domain = 'billing' as const;

  constructor(private readonly billing: BillingService) {}

  tools(): AiToolDefinition[] {
    return [
      defineTool({
        name: 'billing.getFinancialSummary',
        domain: 'billing',
        mode: 'read',
        permission: 'ai.read.billing',
        description:
          'All-time billing totals (billed revenue of non-cancelled invoices, paid, pending, overdue, invoice count), revenue billed so far this calendar month, and billed revenue per month for the last `trendMonths` months (1-12, oldest first). Revenue means billed invoice value, not cash collected.',
        input: z.object({ trendMonths: z.number().int().min(1).max(12).default(6) }),
        output: z.object({
          allTime: z.object({
            totalRevenue: z.number(),
            paidAmount: z.number(),
            pendingAmount: z.number(),
            overdueAmount: z.number(),
            totalInvoices: z.number(),
          }),
          revenueThisMonth: z.number(),
          monthlyTrend: z.array(z.object({ month: z.string(), revenue: z.number() })),
        }),
        execute: async (args, ctx) => {
          const [overview, thisMonth, trend] = await Promise.all([
            this.billing.overview(ctx.user),
            this.billing.revenueThisMonth(),
            this.billing.monthlyRevenueTrend(args.trendMonths),
          ]);
          return { allTime: overview, revenueThisMonth: thisMonth.amount, monthlyTrend: trend };
        },
      }),
      defineTool({
        name: 'billing.getOutstandingInvoices',
        domain: 'billing',
        mode: 'read',
        permission: 'ai.read.billing',
        description:
          'Non-cancelled invoices with an unpaid balance (remaining > 0), optionally only overdue ones. Sorted by largest balance or oldest due date. Returns at most `limit` rows (max 100) plus exact counts and totals over all matching invoices. Patients are identified by id and a privacy-safe label.',
        input: z.object({
          overdueOnly: z.boolean().default(false),
          sortBy: z.enum(['remaining', 'dueDate']).default('remaining'),
          limit: z.number().int().min(1).max(100).default(25),
        }),
        output: z.object({
          total: z.number(),
          returned: z.number(),
          totalOutstanding: z.number(),
          overdueCount: z.number(),
          totalOverdue: z.number(),
          invoices: z.array(
            z.object({
              id: z.string(),
              invoiceNumber: z.string(),
              patientId: z.string(),
              patient: z.string(),
              amount: z.number(),
              amountPaid: z.number(),
              remaining: z.number(),
              issueDate: z.string(),
              dueDate: z.string(),
              status: z.string(),
              overdue: z.boolean(),
              daysOverdue: z.number(),
            }),
          ),
        }),
        execute: async (args, ctx) => {
          const now = today();
          const outstanding = (await this.billing.findAll(ctx.user)).filter(
            (invoice) => invoice.status !== 'cancelled' && invoice.remaining > 0,
          );
          const isOverdue = (invoice: InvoiceResponse) => invoice.status === 'overdue' || invoice.dueDate < now;
          const overdue = outstanding.filter(isOverdue);
          const matching = (args.overdueOnly ? overdue : outstanding).slice();
          matching.sort((a, b) =>
            args.sortBy === 'remaining' ? b.remaining - a.remaining : a.dueDate.localeCompare(b.dueDate),
          );
          const rows = matching.slice(0, args.limit).map((invoice) => {
            const overdueFlag = isOverdue(invoice);
            return {
              id: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              patientId: invoice.patientId,
              patient: ctx.phi.patientName(invoice.patientId, invoice.patientName),
              amount: invoice.amount,
              amountPaid: invoice.amountPaid,
              remaining: invoice.remaining,
              issueDate: invoice.issueDate,
              dueDate: invoice.dueDate,
              status: invoice.status,
              overdue: overdueFlag,
              daysOverdue: overdueFlag ? Math.max(0, daysInRange(invoice.dueDate, now) - 1) : 0,
            };
          });
          return {
            total: matching.length,
            returned: rows.length,
            totalOutstanding: roundMoney(outstanding.reduce((sum, invoice) => sum + invoice.remaining, 0)),
            overdueCount: overdue.length,
            totalOverdue: roundMoney(overdue.reduce((sum, invoice) => sum + invoice.remaining, 0)),
            invoices: rows,
          };
        },
      }),
      defineTool({
        name: 'billing.comparePeriods',
        domain: 'billing',
        mode: 'read',
        permission: 'ai.read.billing',
        description:
          'Compare two date ranges (each inclusive, YYYY-MM-DD, max 366 days). Per period: invoices issued and their billed value (non-cancelled, same revenue definition as the Billing page), cancelled invoice count, payments recorded in the period and their gross amount, how much of those payments has since been refunded (refund dates are not exposed, so refunds are attributed to the payment), and net collected. Also the change from periodA to periodB.',
        input: z.object({ periodA: period, periodB: period }),
        output: z.object({
          periodA: periodTotals,
          periodB: periodTotals,
          change: z.object({ invoiced: change, collected: change, netCollected: change }),
        }),
        execute: async (args, ctx) => {
          const invoices = await this.billing.findAll(ctx.user);
          const totals = (p: { from: string; to: string }) => {
            const issued = invoices.filter((invoice) => inRange(invoice.issueDate, p.from, p.to));
            const billed = issued.filter((invoice) => invoice.status !== 'cancelled');
            const payments = invoices
              .flatMap((invoice) => invoice.payments)
              .filter((payment) => inRange(payment.createdAt, p.from, p.to));
            const collected = roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));
            const refunded = roundMoney(payments.reduce((sum, payment) => sum + payment.refundedAmount, 0));
            return {
              from: p.from,
              to: p.to,
              invoiceCount: billed.length,
              invoiced: roundMoney(billed.reduce((sum, invoice) => sum + invoice.amount, 0)),
              cancelledCount: issued.length - billed.length,
              paymentCount: payments.length,
              collected,
              refundedOfCollected: refunded,
              netCollected: roundMoney(collected - refunded),
            };
          };
          const a = totals(args.periodA);
          const b = totals(args.periodB);
          const diff = (key: 'invoiced' | 'collected' | 'netCollected') => ({
            absolute: roundMoney(b[key] - a[key]),
            percent: pctChange(a[key], b[key]),
          });
          return {
            periodA: a,
            periodB: b,
            change: { invoiced: diff('invoiced'), collected: diff('collected'), netCollected: diff('netCollected') },
          };
        },
      }),
      defineTool({
        name: 'billing.findDiscrepancies',
        domain: 'billing',
        mode: 'read',
        permission: 'ai.read.billing',
        description:
          'Check every invoice for inconsistencies the billing data can show: cancelled invoices that still hold (net) payments, overpaid invoices (paid more than billed), payments refunded for more than they were, non-cancelled invoices with a zero/negative total or no line items, and due dates before the issue date. Invoice status is derived from payments, so "paid but balance remaining" cannot occur and is not checked. Returns at most `limit` issues (max 100) plus the exact total.',
        input: z.object({ limit: z.number().int().min(1).max(100).default(50) }),
        output: z.object({
          checked: z.number(),
          totalIssues: z.number(),
          returned: z.number(),
          issues: z.array(
            z.object({
              invoiceId: z.string(),
              invoiceNumber: z.string(),
              patientId: z.string(),
              patient: z.string(),
              issue: z.string(),
              amount: z.number(),
              amountPaid: z.number(),
            }),
          ),
        }),
        execute: async (args, ctx) => {
          const invoices = await this.billing.findAll(ctx.user);
          const issues = invoices.flatMap((invoice) => {
            const found: string[] = [];
            const cancelled = invoice.status === 'cancelled';
            if (cancelled && invoice.amountPaid > 0.01) {
              found.push(`Cancelled but still holds ${invoice.amountPaid.toFixed(2)} in payments (refund decision pending)`);
            }
            if (!cancelled && invoice.amountPaid > invoice.amount + 0.01) {
              found.push(`Overpaid by ${(invoice.amountPaid - invoice.amount).toFixed(2)}`);
            }
            if (invoice.payments.some((payment) => payment.refundedAmount > payment.amount + 0.01)) {
              found.push('A payment has been refunded for more than its amount');
            }
            if (!cancelled && invoice.amount <= 0) found.push('Invoice total is zero or negative');
            if (!cancelled && invoice.items.length === 0) found.push('Invoice has no line items');
            if (invoice.dueDate < invoice.issueDate) found.push('Due date is before the issue date');
            return found.map((issue) => ({
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              patientId: invoice.patientId,
              patient: ctx.phi.patientName(invoice.patientId, invoice.patientName),
              issue,
              amount: invoice.amount,
              amountPaid: invoice.amountPaid,
            }));
          });
          const rows = issues.slice(0, args.limit);
          return { checked: invoices.length, totalIssues: issues.length, returned: rows.length, issues: rows };
        },
      }),
    ];
  }
}
