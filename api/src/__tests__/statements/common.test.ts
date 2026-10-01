import { cleanDescription, parseUkDate } from '@/statements/common';

describe('cleanDescription', () => {
  it.each([
    ['5320 29SEP26 CD , TFL TRAVEL CH , TFL.GOV.UK/CP GB', 'TFL TRAVEL CH, TFL.GOV.UK/CP GB'],
    ['TESCO STORE 3234 , SUDBURY GB , 6285 30AUG26 C', 'TESCO STORE 3234, SUDBURY GB'],
    ['JANE DOE , NURSERY , VIA MOBILE - PYMT , FP 30/09/26 10 , 52160253187811000N', 'JANE DOE, NURSERY'],
    ['From A/C 87654321 , DOE J , Via Mobile Xfer', 'From A/C 87654321, DOE J'],
    ['PULSE8BROADBAND', 'PULSE8BROADBAND'],
    ['ROUND UP TO 1234', 'ROUND UP TO 1234'],
  ])('%s → %s', (raw, expected) => {
    expect(cleanDescription(raw)).toBe(expected);
  });
});

describe('parseUkDate', () => {
  it.each([
    ['30 Sep 2026', '2026-09-30'],
    ['1 Sep 2026', '2026-09-01'],
    ['30/09/2026', '2026-09-30'],
    ['31 Foo 2026', null],
    ['2026-09-30', null],
  ])('%s → %s', (raw, expected) => {
    expect(parseUkDate(raw)).toBe(expected);
  });
});
