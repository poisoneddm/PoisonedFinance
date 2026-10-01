export interface ParsedTxn {
  date: string;          // YYYY-MM-DD
  description: string;
  amount_pence: number;  // negative = debit, positive = credit
}

export interface StatementAccount {
  externalId: string;    // e.g. "600513-17924995" (sort code + account number)
  name: string;
}

export interface ParsedStatement {
  account: StatementAccount | null;
  transactions: ParsedTxn[];
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04',
  may: '05', jun: '06', jul: '07', aug: '08',
  sep: '09', oct: '10', nov: '11', dec: '12',
};

// "30 Sep 2026" or "30/09/2026" → "2026-09-30"
export function parseUkDate(value: string): string | null {
  const v = value.trim();
  let m = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(v);
  if (m) {
    const month = MONTH_MAP[m[2].toLowerCase()];
    return month ? `${m[3]}-${month}-${m[1].padStart(2, '0')}` : null;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// "-1,354.89" → -135489
export function toPence(value: string): number {
  return Math.round(parseFloat(value.replace(/[£,\s]/g, '')) * 100);
}

export function accountFromNumbers(sortCode: string, accountNumber: string): StatementAccount {
  const externalId = sortCode ? `${sortCode}-${accountNumber}` : accountNumber;
  return { externalId, name: `Account ending ${accountNumber.slice(-4)}` };
}

// Card number, transaction date and flags: "5320 29SEP26 CD"
const CARD_SEGMENT_RE = /^\d{4} \d{2}[A-Z]{3}\d{2}(?: [A-Z]{1,2})?$/;
const FASTER_PAYMENT_SEGMENT_RE = /^FP \d{2}\/\d{2}\/\d{2}\b/;
const CHANNEL_SEGMENT_RE = /^via mobile(?: - pymt| xfer)$/i;
const REFERENCE_SEGMENT_RE = /^(?=.*\d)[A-Z0-9]{14,}$/;

// NatWest packs card numbers, dates and payment references into descriptions.
// Dropping them keeps descriptions stable across months (so categorisation rules
// re-match) and makes PDF, CSV and OFX exports describe a payment the same way.
export function cleanDescription(raw: string): string {
  const segments = raw
    .split(',')
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((s, i) => {
      if (CARD_SEGMENT_RE.test(s)) return false;
      if (i === 0) return true;
      return !FASTER_PAYMENT_SEGMENT_RE.test(s)
        && !CHANNEL_SEGMENT_RE.test(s)
        && !REFERENCE_SEGMENT_RE.test(s);
    });
  return segments.length > 0 ? segments.join(', ') : raw.replace(/\s+/g, ' ').trim();
}
