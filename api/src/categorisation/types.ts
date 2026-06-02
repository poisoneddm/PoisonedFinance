export interface TxnForCategorisation {
  id: string;            // transaction UUID
  merchant_name: string | null;
  description: string;
}

export interface CategorizationResult {
  id: string;
  category_name: string;   // must match a name in the categories table
  source: 'rule' | 'ai';
}
