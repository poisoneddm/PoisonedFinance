import { parseCsv } from '@/statements/csv';

const FIXTURE = [
  'Date,Type,Description,Value,Balance,Account Name,Account Number',
  '01 Sep 2026,CHG,10AUG A/C 12345678,-2.00,3507.27,Doe J,600000-12345678',
  '01 Sep 2026,POS,"5320 30AUG26 CD , STOWMARKET GOLF , CENTRE , STOWMARKET IP GB",-2.00,3505.27,Doe J,600000-12345678',
  '01 Sep 2026,S/O,"TSB BANK PLC , FP 01/09/26 30 , 04014648296244000N",-500.00,3005.27,Doe J,600000-12345678',
  '14 Sep 2026,DPC,"From A/C 87654321 , DOE J , Via Mobile Xfer",1163.00,4168.27,Doe J,600000-12345678',
  '30 Sep 2026,BAC,"ACME ""PAYROLL"" LTD",2472.42,6640.69,Doe J,600000-12345678',
  '',
].join('\r\n');

describe('parseCsv — NatWest export', () => {
  const { account, transactions } = parseCsv(FIXTURE);

  it('reads the account from the Account Number column', () => {
    expect(account).toEqual({ externalId: '600000-12345678', name: 'Account ending 5678' });
  });

  it('parses signed values, quoted fields and cleans NatWest descriptions', () => {
    expect(transactions).toEqual([
      { date: '2026-09-01', description: '10AUG A/C 12345678', amount_pence: -200 },
      { date: '2026-09-01', description: 'STOWMARKET GOLF, CENTRE, STOWMARKET IP GB', amount_pence: -200 },
      { date: '2026-09-01', description: 'TSB BANK PLC', amount_pence: -50000 },
      { date: '2026-09-14', description: 'From A/C 87654321, DOE J', amount_pence: 116300 },
      { date: '2026-09-30', description: 'ACME "PAYROLL" LTD', amount_pence: 247242 },
    ]);
  });

  it('accepts DD/MM/YYYY dates and an Amount column', () => {
    const { transactions: [txn] } = parseCsv('Date,Description,Amount\n05/09/2026,COFFEE,-3.20\n');
    expect(txn).toEqual({ date: '2026-09-05', description: 'COFFEE', amount_pence: -320 });
  });

  it('returns no transactions when there is no recognisable header', () => {
    expect(parseCsv('foo,bar\n1,2\n').transactions).toEqual([]);
  });
});
