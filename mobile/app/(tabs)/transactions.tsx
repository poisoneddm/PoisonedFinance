import React, { useCallback, useRef, useState } from 'react';
import { useRouter, useFocusEffect } from 'expo-router';
import { TransactionsScreen } from '@/screens/TransactionsScreen';
import { SEED_USER_ID } from '@/lib/currentUser';

export default function TransactionsTab() {
  const now = new Date();
  const router = useRouter();

  // Remount the screen (fresh fetch) when the tab regains focus — e.g. after
  // recategorising a transaction in the Category Edit modal — but skip the
  // initial focus so we don't double-fetch on first display.
  const [refreshKey, setRefreshKey] = useState(0);
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      setRefreshKey(k => k + 1);
    }, []),
  );

  return (
    <TransactionsScreen
      key={refreshKey}
      userId={SEED_USER_ID}
      year={now.getFullYear()}
      month={now.getMonth() + 1}
      onTransactionPress={txn =>
        router.push({
          pathname: '/category-edit',
          params: {
            txnId: txn.id,
            merchant: txn.merchant_name ?? txn.description,
            amountPence: String(txn.amount_pence),
            date: txn.transaction_date,
            account: txn.account_name ?? '',
            current: txn.category_name ?? '',
          },
        })
      }
    />
  );
}
