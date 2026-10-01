import {
  accountFromNumbers,
  cleanDescription,
  parseUkDate,
  toPence,
  type ParsedStatement,
  type ParsedTxn,
} from './common';

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(f => f.trim() !== ''));
}

// NatWest export columns: Date, Type, Description, Value, Balance, Account Name, Account Number
export function parseCsv(text: string): ParsedStatement {
  const rows = parseCsvRows(text.replace(/^﻿/, ''));
  const headerIndex = rows.findIndex(r => r.some(f => f.trim().toLowerCase() === 'date'));
  if (headerIndex === -1) return { account: null, transactions: [] };

  const header = rows[headerIndex].map(h => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex(h => names.includes(h));
  const dateCol = col('date');
  const descCol = col('description', 'narrative', 'details');
  const valueCol = col('value', 'amount');
  const accountCol = col('account number');
  if (descCol === -1 || valueCol === -1) return { account: null, transactions: [] };

  const transactions: ParsedTxn[] = [];
  let accountNumber = '';
  for (const r of rows.slice(headerIndex + 1)) {
    const date = parseUkDate(r[dateCol] ?? '');
    const amount_pence = toPence(r[valueCol] ?? '');
    if (!date || Number.isNaN(amount_pence)) continue;
    transactions.push({ date, description: cleanDescription(r[descCol] ?? ''), amount_pence });
    if (!accountNumber && accountCol !== -1) accountNumber = (r[accountCol] ?? '').trim();
  }

  // "600513-17924995" → sort code + account number
  const m = /^(\d{6})-?(\d{6,})$/.exec(accountNumber.replace(/[\s']/g, ''));
  return { account: m ? accountFromNumbers(m[1], m[2]) : null, transactions };
}
