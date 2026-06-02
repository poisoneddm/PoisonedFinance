export interface TrueLayerAccount {
  account_id: string;
  account_type: 'TRANSACTION' | 'SAVINGS' | 'CARD';
  display_name: string;
  currency: string;
  provider: { display_name: string; provider_id: string };
}

export interface TrueLayerTransaction {
  transaction_id: string;
  timestamp: string;           // ISO 8601 — this is the posted date
  transaction_type: 'DEBIT' | 'CREDIT';
  description: string;
  merchant_name?: string;
  amount: number;              // negative = debit, positive = credit
  currency: string;
  meta?: {
    transaction_time?: string; // ISO 8601 transaction date when available
  };
}

export interface TrueLayerTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'Bearer';
  scope: string;
}

export interface TrueLayerApiResponse<T> {
  results: T[];
  status: string;
}
