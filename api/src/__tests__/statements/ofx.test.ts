import { parseOfx } from '@/statements/ofx';

const SGML_FIXTURE = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
  <BANKMSGSRSV1><STMTTRNRS><STMTRS>
    <CURDEF>GBP</CURDEF>
    <BANKACCTFROM>
      <BANKID>600000</BANKID>
      <ACCTID>12345678</ACCTID>
      <ACCTTYPE>CHECKING</ACCTTYPE>
    </BANKACCTFROM>
    <BANKTRANLIST>
      <STMTTRN>
        <TRNTYPE>POS</TRNTYPE>
        <DTPOSTED>20260901</DTPOSTED>
        <TRNAMT>-2.00</TRNAMT>
        <FITID>202609010002</FITID>
        <NAME>STOWMARKET GOLF</NAME>
        <MEMO>CENTRE  , STOWMARKET IP GB , 5320 30AUG26 CD</MEMO>
      </STMTTRN>
      <STMTTRN>
        <TRNTYPE>CREDIT</TRNTYPE>
        <DTPOSTED>20260930120000[0:GMT]</DTPOSTED>
        <TRNAMT>2472.42</TRNAMT>
        <FITID>202609300001</FITID>
        <NAME>B &amp; Q 1152</NAME>
      </STMTTRN>
    </BANKTRANLIST>
  </STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

describe('parseOfx', () => {
  const { account, transactions } = parseOfx(SGML_FIXTURE);

  it('reads the account from BANKID and ACCTID', () => {
    expect(account).toEqual({ externalId: '600000-12345678', name: 'Account ending 5678' });
  });

  it('parses transactions, merging NAME and MEMO and dropping card details', () => {
    expect(transactions).toEqual([
      { date: '2026-09-01', description: 'STOWMARKET GOLF, CENTRE, STOWMARKET IP GB', amount_pence: -200 },
      { date: '2026-09-30', description: 'B & Q 1152', amount_pence: 247242 },
    ]);
  });

  it('handles SGML without closing tags', () => {
    const sgml = '<OFX><BANKTRANLIST><STMTTRN><DTPOSTED>20260905\n<TRNAMT>-3.20\n<NAME>COFFEE\n<STMTTRN><DTPOSTED>20260906\n<TRNAMT>10\n<NAME>REFUND\n</BANKTRANLIST>';
    expect(parseOfx(sgml).transactions).toEqual([
      { date: '2026-09-05', description: 'COFFEE', amount_pence: -320 },
      { date: '2026-09-06', description: 'REFUND', amount_pence: 1000 },
    ]);
  });
});
