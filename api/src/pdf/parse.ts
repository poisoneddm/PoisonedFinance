export interface ParsedTxn {
  date: string;          // YYYY-MM-DD
  description: string;
  amount_pence: number;  // negative = debit, positive = credit
}

// Month name → zero-padded two-digit month number
const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04',
  may: '05', jun: '06', jul: '07', aug: '08',
  sep: '09', oct: '10', nov: '11', dec: '12',
};

// Matches lines like:
//   12/03/2026    TESCO STORES 3471    -45.67
//   25/03/2026    SALARY BACS PAYMENT  1500.00CR
//   08 Apr 2026   AMAZON MKTPLACE PMT  -12.99
//
// Named capture groups:
//   dmy   — DD/MM/YYYY  (group 1) OR
//   dmy2  — DD MMM YYYY (group 2)
//   desc  — description (trimmed, may contain spaces)
//   neg   — leading minus (optional)
//   amt   — numeric amount (digits and dot)
//   cr    — "CR" suffix (optional, means credit)
const LINE_RE =
  /^(?:(\d{2})\/(\d{2})\/(\d{4})|(\d{2})\s+([A-Za-z]{3})\s+(\d{4}))\s{2,}(.+?)\s{2,}(-?)(\d+\.\d{2})(CR)?$/;

function parseLine(line: string): ParsedTxn | null {
  const m = LINE_RE.exec(line.trim());
  if (!m) return null;

  let date: string;
  if (m[1]) {
    // DD/MM/YYYY
    date = `${m[3]}-${m[2]}-${m[1]}`;
  } else {
    // DD MMM YYYY
    const monthNum = MONTH_MAP[m[5].toLowerCase()];
    if (!monthNum) return null;
    date = `${m[6]}-${monthNum}-${m[4]}`;
  }

  const description = m[7].trim();
  const isDebit = m[8] === '-';
  const isCredit = m[10] === 'CR';
  const pence = Math.round(parseFloat(m[9]) * 100);

  // A leading minus with no CR suffix = debit (negative).
  // CR suffix = credit (positive), regardless of leading minus.
  const amount_pence = isCredit ? pence : isDebit ? -pence : pence;

  return { date, description, amount_pence };
}

export function parseStatementText(text: string): ParsedTxn[] {
  const results: ParsedTxn[] = [];
  for (const line of text.split('\n')) {
    const txn = parseLine(line);
    if (txn) results.push(txn);
  }
  return results;
}
