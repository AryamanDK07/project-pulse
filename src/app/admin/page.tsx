'use client';
import AdminOverview from '@/components/AdminOverview';
import { Shell } from '@/components/ui';

export default function Page() {
  return (<Shell allow={['coordinator', 'admin']} title="Coordinator overview"><AdminOverview /></Shell>);
}
