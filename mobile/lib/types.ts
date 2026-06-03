export type PillLevel = 'green' | 'amber' | 'red' | 'none';

export type MetaBucket = 'needs' | 'wants' | 'savings';

/** A transaction awaiting category confirmation — GET /review/:userId (contracts §10). */
export interface ReviewTransaction {
  id: string;
  merchant_name: string | null;
  description: string;
  amount_pence: number;
  transaction_date: string;
  categorisation_source: string | null;
  category_name: string | null;
  meta_bucket: MetaBucket | null;
  account_name: string | null;
}

/** A selectable category — GET /categories. */
export interface Category {
  id: string;
  name: string;
  meta_bucket: MetaBucket;
  color_hex: string;
}
