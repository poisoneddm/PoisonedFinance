import {
  accountFromNumbers,
  cleanDescription,
  toPence,
  type ParsedStatement,
  type ParsedTxn,
} from './common';

// Reads a tag's value from both OFX 1.x SGML (closing tags optional) and OFX 2.x XML.
function tag(block: string, name: string): string | null {
  const m = new RegExp(`<${name}>([^<\\r\\n]*)`, 'i').exec(block);
  if (!m) return null;
  return m[1]
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

export function parseOfx(text: string): ParsedStatement {
  const transactions: ParsedTxn[] = [];
  for (const [, block] of text.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi)) {
    const posted = tag(block, 'DTPOSTED');
    const amount = tag(block, 'TRNAMT');
    if (!posted || !amount || !/^\d{8}/.test(posted)) continue;
    const amount_pence = toPence(amount);
    if (Number.isNaN(amount_pence)) continue;

    const name = tag(block, 'NAME') ?? '';
    const memo = tag(block, 'MEMO') ?? '';
    transactions.push({
      date: `${posted.slice(0, 4)}-${posted.slice(4, 6)}-${posted.slice(6, 8)}`,
      description: cleanDescription(memo ? `${name} , ${memo}` : name),
      amount_pence,
    });
  }

  const accountNumber = tag(text, 'ACCTID');
  const account = accountNumber ? accountFromNumbers(tag(text, 'BANKID') ?? '', accountNumber) : null;
  return { account, transactions };
}
