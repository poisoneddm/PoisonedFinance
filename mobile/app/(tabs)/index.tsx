import React from 'react';
import { useRouter } from 'expo-router';
import { DashboardScreen } from '@/screens/DashboardScreen';
import { SEED_USER_ID } from '@/lib/currentUser';

export default function DashboardTab() {
  const now = new Date();
  const router = useRouter();
  return (
    <DashboardScreen
      userId={SEED_USER_ID}
      year={now.getFullYear()}
      month={now.getMonth() + 1}
      onReviewPress={() => router.push('/review')}
    />
  );
}
