export function formatInvoiceNumber(invoiceNumber: number): string {
  return `INV-${String(invoiceNumber).padStart(4, '0')}`;
}
