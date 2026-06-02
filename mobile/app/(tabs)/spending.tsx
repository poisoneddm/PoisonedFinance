import React from 'react';
import { SpendingScreen } from '@/screens/SpendingScreen';
import { SEED_USER_ID } from '@/lib/currentUser';

export default function SpendingTab() {
  const now = new Date();
  return (
    <SpendingScreen
      userId={SEED_USER_ID}
      year={now.getFullYear()}
      month={now.getMonth() + 1}
    />
  );
}
