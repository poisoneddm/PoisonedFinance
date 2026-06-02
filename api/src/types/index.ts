export type MetaBucket = 'needs' | 'wants' | 'savings';
export type CategorizationSource = 'rule' | 'ai' | 'manual' | 'confirmed';

export interface User {
  id: string;
  email: string;
  created_at: Date;
}

export interface BankConnection {
  id: string;
  user_id: string;
  provider: string;
  access_token_enc: string;
  refresh_token_enc: string;
  token_expires_at: Date;
  created_at: Date;
}

export interface LinkedAccount {
  id: string;
  user_id: string;
  connection_id: string;
  provider: string;
  external_id: string;
  account_name: string;
  account_type: string;
  currency: string;
  last_synced_at: Date | null;
  created_at: Date;
}

export interface Category {
  id: string;
  name: string;
  meta_bucket: MetaBucket;
  color_hex: string;
}

export interface CategorizationRule {
  id: string;
  user_id: string;
  merchant_pattern: string;
  category_id: string;
  created_at: Date;
}

export interface Transaction {
  id: string;
  account_id: string;
  user_id: string;
  external_id: string;
  merchant_name: string | null;
  description: string;
  amount_pence: number;
  currency: string;
  transaction_date: Date;
  posted_date: Date | null;
  category_id: string | null;
  categorisation_source: CategorizationSource | null;
  needs_review: boolean;
  created_at: Date;
}

export interface MonthlyGoal {
  id: string;
  user_id: string;
  year: number;
  month: number;
  needs_pct: number;
  wants_pct: number;
  savings_pct: number;
}
