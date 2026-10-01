import { parsePdfText } from '@/statements/pdf';

describe('parsePdfText — whitespace-separated statements', () => {
  const FIXTURE = `
Account Statement — Current Account

Date          Description                          Amount
12/03/2026    TESCO STORES 3471                   -45.67
25/03/2026    SALARY BACS PAYMENT                 1500.00CR
08 Apr 2026   AMAZON MKTPLACE PMT                 -12.99
this line is junk and should be ignored entirely
`.trim();

  const { transactions } = parsePdfText(FIXTURE);

  it('returns exactly 3 parsed transactions (junk line excluded)', () => {
    expect(transactions).toHaveLength(3);
  });

  it('parses DD/MM/YYYY debit: correct date, description, negative pence', () => {
    expect(transactions).toContainEqual({ date: '2026-03-12', description: 'TESCO STORES 3471', amount_pence: -4567 });
  });

  it('parses DD/MM/YYYY credit (CR suffix): positive pence', () => {
    expect(transactions).toContainEqual({ date: '2026-03-25', description: 'SALARY BACS PAYMENT', amount_pence: 150000 });
  });

  it('parses DD MMM YYYY date format', () => {
    expect(transactions).toContainEqual({ date: '2026-04-08', description: 'AMAZON MKTPLACE PMT', amount_pence: -1299 });
  });
});

describe('parsePdfText — NatWest online transactions export', () => {
  // pdf-parse output: no column spacing, wrapped descriptions, newest first.
  const FIXTURE = [
    'Transactions',
    'Account type: Reward',
    'Account number: 12345678',
    'Sort code: 600000',
    'Your transactions',
    'Date: 01 Oct 2026',
    'Showing: 01 Sep 2026 to 30 Sep 2026, All Transactions',
    'DateTypeDescriptionPaid inPaid outBalance',
    '30 Sep 2026TFRROUND UP TO 1234£0.10£3,941.44',
    '30 Sep 2026POS',
    '5320 29SEP26 CD , TFL TRAVEL CH , ',
    'TFL.GOV.UK/CP GB',
    '£3.90£3,941.54',
    '30 Sep 2026BACSCC PAYROLL£2,472.42£3,945.44',
    'Page 1 of 2',
    '',
    'DateTypeDescriptionPaid inPaid outBalance',
    '29 Sep 2026DPC',
    'JANE DOE , NURSERY , VIA MOBILE ',
    '- PYMT , FP 29/09/26 10 , ',
    '52160253187811000N',
    '£72.00£1,473.02',
    '29 Sep 2026D/DO2£31.99£1,545.02',
    '01 Sep 2026CHG10AUG A/C 12345678£2.00£1,577.01',
    '© National Westminster Bank plc',
    'Page 2 of 2',
  ].join('\n');

  const { account, transactions } = parsePdfText(FIXTURE);

  it('reads the sort code and account number', () => {
    expect(account).toEqual({ externalId: '600000-12345678', name: 'Account ending 5678' });
  });

  it('parses every row, including wrapped descriptions and rows across page breaks', () => {
    expect(transactions).toEqual([
      { date: '2026-09-30', description: 'ROUND UP TO 1234', amount_pence: -10 },
      { date: '2026-09-30', description: 'TFL TRAVEL CH, TFL.GOV.UK/CP GB', amount_pence: -390 },
      { date: '2026-09-30', description: 'SCC PAYROLL', amount_pence: 247242 },
      { date: '2026-09-29', description: 'JANE DOE, NURSERY', amount_pence: -7200 },
      { date: '2026-09-29', description: 'O2', amount_pence: -3199 },
      { date: '2026-09-01', description: '10AUG A/C 12345678', amount_pence: -200 },
    ]);
  });

  it('falls back to the transaction type for the sign when the balance does not reconcile', () => {
    const { transactions: [txn] } = parsePdfText('01 Sep 2026BACEMPLOYER£100.00£500.00');
    expect(txn.amount_pence).toBe(10000);
  });
});
