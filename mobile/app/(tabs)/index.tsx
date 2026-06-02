import React from 'react';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { SEED_USER_ID } from '@/lib/currentUser';

export default function DashboardTab() {
  const now = new Date();
  return (
    <DashboardScreen
      userId={SEED_USER_ID}
      year={now.getFullYear()}
      month={now.getMonth() + 1}
    />
  );
}
