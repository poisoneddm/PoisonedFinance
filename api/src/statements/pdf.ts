import {
  accountFromNumbers,
  cleanDescription,
  parseUkDate,
  toPence,
  type ParsedStatement,
  type ParsedTxn,
} from './common';

// Generic statements with whitespace-separated columns and a signed amount:
//   12/03/2026    TESCO STORES 3471    -45.67
//   25/03/2026    SALARY BACS PAYMENT  1500.00CR
//   08 Apr 2026   AMAZON MKTPLACE PMT  -12.99
const LINE_RE =
  /^(\d{2}\/\d{2}\/\d{4}|\d{2}\s+[A-Za-z]{3}\s+\d{4})\s{2,}(.+?)\s{2,}(-?)(\d+\.\d{2})(CR)?$/;

function parseSpacedLines(text: string): ParsedTxn[] {
  const results: ParsedTxn[] = [];
  for (const line of text.split('\n')) {
    const m = LINE_RE.exec(line.trim());
    if (!m) continue;
    const date = parseUkDate(m[1].replace(/\s+/g, ' '));
    if (!date) continue;
    const pence = toPence(m[4]);
    // CR suffix = credit regardless of sign; otherwise a leading minus = debit.
    const amount_pence = m[5] === 'CR' ? pence : m[3] === '-' ? -pence : pence;
    results.push({ date, description: m[2].trim(), amount_pence });
  }
  return results;
}

// NatWest online "Transactions" export. pdf-parse emits each row with no column
// spacing, and long descriptions wrap onto extra lines:
//   30 Sep 2026TFRROUND UP TO 5197£0.10£3,941.44
//   30 Sep 2026POS
//   5320 29SEP26 CD , TFL TRAVEL CH ,
//   TFL.GOV.UK/CP GB
//   £3.90£3,941.54
// Paid in / Paid out collapse into one unsigned amount, so the sign is recovered
// from the running balance.
const ROW_START_RE = /^(\d{2} [A-Za-z]{3} \d{4})(.*)$/;
const ROW_END_RE = /^(.*?)£([\d,]+\.\d{2})(-?)£([\d,]+\.\d{2})(-?)\s*$/;
const TYPE_RE = /^(BAC|BGC|CHG|CHQ|CDM|C\/L|D\/D|DPC|EBP|IBP|INT|ITL|OTR|POS|S\/O|TFR|ATM)(.*)$/;
const CREDIT_TYPES = new Set(['BAC', 'BGC', 'CDM', 'IBP', 'INT']);

interface BalanceRow {
  date: string;
  type: string;
  description: string;
  amount_pence: number;   // unsigned
  balance_pence: number;
}

function buildRow(date: string, lines: string[]): BalanceRow | null {
  const end = ROW_END_RE.exec(lines[lines.length - 1]);
  if (!end) return null;
  const bodyLines = [...lines.slice(0, -1), end[1]].map(l => l.trim()).filter(Boolean);
  if (bodyLines.length === 0) return null;

  let type = '';
  if (bodyLines.length > 1 && /^[A-Z/]{2,4}$/.test(bodyLines[0])) {
    type = bodyLines.shift()!;
  } else {
    const t = TYPE_RE.exec(bodyLines[0]);
    if (t) {
      type = t[1];
      bodyLines[0] = t[2];
    }
  }

  const balance = toPence(end[4]);
  return {
    date,
    type,
    description: cleanDescription(bodyLines.join(' ')) || type,
    amount_pence: toPence(end[2]),
    balance_pence: end[5] === '-' ? -balance : balance,
  };
}

function parseBalanceRows(text: string): ParsedTxn[] {
  const rows: BalanceRow[] = [];
  let current: { date: string; lines: string[] } | null = null;

  for (const line of text.split('\n')) {
    const start = ROW_START_RE.exec(line);
    const startDate = start && parseUkDate(start[1]);
    if (start && startDate) {
      current = { date: startDate, lines: [start[2]] };
    } else if (current) {
      current.lines.push(line);
    } else {
      continue;
    }
    if (ROW_END_RE.test(current.lines[current.lines.length - 1])) {
      const row = buildRow(current.date, current.lines);
      if (row) rows.push(row);
      current = null;
    }
  }

  // The export lists newest first; fall back to oldest-first if the dates say so.
  const newestFirst = rows.length < 2 || rows[0].date >= rows[rows.length - 1].date;

  return rows.map((row, i) => {
    const prior = rows[newestFirst ? i + 1 : i - 1];
    let sign: number;
    if (prior && Math.abs(row.balance_pence - prior.balance_pence) === row.amount_pence) {
      sign = row.balance_pence >= prior.balance_pence ? 1 : -1;
    } else {
      sign = CREDIT_TYPES.has(row.type) ? 1 : -1;
    }
    return { date: row.date, description: row.description, amount_pence: sign * row.amount_pence };
  });
}

function parseAccount(text: string) {
  const sortCode = /Sort code:\s*([\d-]{6,8})/i.exec(text)?.[1].replace(/-/g, '');
  const accountNumber = /Account number:\s*(\d{6,})/i.exec(text)?.[1];
  return sortCode && accountNumber ? accountFromNumbers(sortCode, accountNumber) : null;
}

export function parsePdfText(text: string): ParsedStatement {
  const balanceRows = parseBalanceRows(text);
  return {
    account: parseAccount(text),
    transactions: balanceRows.length > 0 ? balanceRows : parseSpacedLines(text),
  };
}
