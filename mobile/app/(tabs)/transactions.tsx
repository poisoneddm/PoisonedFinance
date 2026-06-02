import React from 'react';
import { TransactionsScreen } from '@/screens/TransactionsScreen';
import { SEED_USER_ID } from '@/lib/currentUser';

export default function TransactionsTab() {
  const now = new Date();
  return (
    <TransactionsScreen
      userId={SEED_USER_ID}
      year={now.getFullYear()}
      month={now.getMonth() + 1}
    />
  );
}
