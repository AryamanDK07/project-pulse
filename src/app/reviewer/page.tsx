'use client';
import ReviewerDashboard from '@/components/ReviewerDashboard';
import { Shell } from '@/components/ui';

export default function Page() {
  return (<Shell allow={['reviewer']} title="Reviewer workspace"><ReviewerDashboard /></Shell>);
}
