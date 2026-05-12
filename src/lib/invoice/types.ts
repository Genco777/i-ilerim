export type InvoiceType = 'rechnung' | 'teilrechnung' | 'schlussrechnung' | 'angebot';

export interface InvoiceItem {
  description: string;
  unitPriceCents: number;
  quantity: number;
}

export interface InvoiceRecipientData {
  company: string | null;
  name: string;
  street: string;
  zipCity: string;
}

export interface InvoiceData {
  number: string;
  type: InvoiceType;
  date: string;
  recipient: InvoiceRecipientData;
  items: InvoiceItem[];
  totalCents: number;
  footerNote: string | null;
  validUntil?: string;
}

export const INVOICE_TYPE_LABEL: Record<InvoiceType, string> = {
  rechnung: 'RECHNUNG',
  teilrechnung: 'TEILRECHNUNG',
  schlussrechnung: 'SCHLUSSRECHNUNG',
  angebot: 'ANGEBOT',
};

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}
