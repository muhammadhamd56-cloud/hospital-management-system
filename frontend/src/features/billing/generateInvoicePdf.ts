import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/datetime'
import { formatPatientId } from '@/utils/patientId'
import type { Invoice } from '@/types/invoice'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank Transfer',
  OTHER: 'Other',
}

const STATUS_LABELS: Record<Invoice['status'], string> = {
  paid: 'Paid',
  pending: 'Pending',
  partially_paid: 'Partially Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  partially_refunded: 'Partially Refunded',
}

const MARGIN = 14

/** Renders a single invoice as a downloadable PDF, entirely client-side from
 *  data already in the browser -- mirrors the same "build then download, no
 *  backend involved" convention BillingPage's CSV export already uses,
 *  rather than introducing this backend's first non-JSON response type.
 *
 *  jsPDF + jspdf-autotable (and the html2canvas dependency jsPDF pulls in)
 *  are dynamically imported here rather than at module scope -- statically
 *  importing them made this the heaviest chunk in the whole app (450KB+,
 *  bigger than the app's own main bundle) attached to the Billing route,
 *  even though most visits to Billing never click "Download PDF". */
export async function generateInvoicePdf(invoice: Invoice): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])

  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('MediCore HMS', MARGIN, 20)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Invoice ${invoice.invoiceNumber}`, MARGIN, 27)
  doc.text(STATUS_LABELS[invoice.status], 196, 27, { align: 'right' })

  doc.setFontSize(10)
  doc.text(`Patient: ${invoice.patientName} (${formatPatientId(invoice.patientId)})`, MARGIN, 37)
  doc.text(`Invoice date: ${formatDate(invoice.issueDate)}`, MARGIN, 43)
  doc.text(`Due date: ${formatDate(invoice.dueDate)}`, MARGIN, 49)

  if (invoice.description) {
    doc.text(invoice.description, MARGIN, 55)
  }

  autoTable(doc, {
    startY: 60,
    head: [['Service', 'Qty', 'Price', 'Total']],
    body: invoice.items.map((item) => [
      item.description,
      String(item.quantity),
      formatCurrency(item.unitPrice),
      formatCurrency(item.lineTotal),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [30, 41, 59] },
    margin: { left: MARGIN, right: MARGIN },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jspdf-autotable's own plugin-augmented type
  let cursorY = (doc as any).lastAutoTable.finalY + 8

  const summaryLines: [string, string][] = [['Subtotal', formatCurrency(invoice.subtotal)]]
  if (invoice.discount > 0) summaryLines.push(['Discount', `-${formatCurrency(invoice.discount)}`])
  if (invoice.tax > 0) summaryLines.push(['Tax', `+${formatCurrency(invoice.tax)}`])
  summaryLines.push(['Total', formatCurrency(invoice.amount)])
  summaryLines.push(['Paid', formatCurrency(invoice.amountPaid)])
  summaryLines.push(['Remaining', formatCurrency(invoice.remaining)])

  doc.setFontSize(10)
  for (const [label, value] of summaryLines) {
    doc.text(label, MARGIN, cursorY)
    doc.text(value, 196, cursorY, { align: 'right' })
    cursorY += 6
  }

  if (invoice.payments.length > 0) {
    const hasRefunds = invoice.payments.some((payment) => payment.refundedAmount > 0)

    autoTable(doc, {
      startY: cursorY + 4,
      head: [hasRefunds ? ['Date', 'Method', 'Recorded By', 'Amount', 'Refunded'] : ['Date', 'Method', 'Recorded By', 'Amount']],
      body: invoice.payments.map((payment) => {
        const row = [
          formatDate(payment.createdAt),
          PAYMENT_METHOD_LABELS[payment.method] ?? payment.method,
          payment.recordedBy ?? 'Online payment',
          formatCurrency(payment.amount),
        ]
        return hasRefunds ? [...row, payment.refundedAmount > 0 ? formatCurrency(payment.refundedAmount) : '—'] : row
      }),
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59] },
      margin: { left: MARGIN, right: MARGIN },
    })
  }

  doc.save(`${invoice.invoiceNumber}.pdf`)
}
