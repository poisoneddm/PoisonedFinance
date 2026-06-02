/**
 * Format integer pence as a GBP currency string with pence. §13
 * Examples: 123456 → "£1,234.56"  -3450 → "-£34.50"
 */
export function formatPence(pence: number): string {
  const negative = pence < 0;
  const abs = Math.abs(pence);
  const pounds = (abs / 100).toFixed(2);
  const [integer, decimal] = pounds.split('.');
  const intWithCommas = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}£${intWithCommas}.${decimal}`;
}

/**
 * Format integer pence rounded to nearest whole pound, no decimals. §13
 * Examples: 123456 → "£1,235"  -3450 → "-£35"
 */
export function formatPenceShort(pence: number): string {
  const negative = pence < 0;
  const abs = Math.abs(pence);
  const pounds = Math.round(abs / 100);
  const poundsStr = pounds.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}£${poundsStr}`;
}
