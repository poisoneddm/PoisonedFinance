import { parseStatementText } from '@/pdf/parse';

// Multi-line fixture covering:
//   • DD/MM/YYYY debit (negative amount_pence)
//   • DD/MM/YYYY credit with CR suffix (positive amount_pence)
//   • DD MMM YYYY date format
//   • A junk line that must be ignored
const FIXTURE = `
Account Statement — NatWest Current Account

Date          Description                          Amount
12/03/2026    TESCO STORES 3471                   -45.67
25/03/2026    SALARY BACS PAYMENT                 1500.00CR
08 Apr 2026   AMAZON MKTPLACE PMT                 -12.99
this line is junk and should be ignored entirely
`.trim();

describe('parseStatementText', () => {
  let results: ReturnType<typeof parseStatementText>;

  beforeAll(() => {
    results = parseStatementText(FIXTURE);
  });

  it('returns exactly 3 parsed transactions (junk line excluded)', () => {
    expect(results).toHaveLength(3);
  });

  it('parses DD/MM/YYYY debit: correct date, description, negative pence', () => {
    const txn = results.find(r => r.description === 'TESCO STORES 3471');
    expect(txn).toBeDefined();
    expect(txn!.date).toBe('2026-03-12');
    expect(txn!.amount_pence).toBe(-4567);
  });

  it('parses DD/MM/YYYY credit (CR suffix): positive pence', () => {
    const txn = results.find(r => r.description === 'SALARY BACS PAYMENT');
    expect(txn).toBeDefined();
    expect(txn!.date).toBe('2026-03-25');
    expect(txn!.amount_pence).toBe(150000);
  });

  it('parses DD MMM YYYY date format', () => {
    const txn = results.find(r => r.description === 'AMAZON MKTPLACE PMT');
    expect(txn).toBeDefined();
    expect(txn!.date).toBe('2026-04-08');
    expect(txn!.amount_pence).toBe(-1299);
  });
});
