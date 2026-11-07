'use client';
import StudentDashboard from '@/components/StudentDashboard';
import { Shell } from '@/components/ui';

export default function Page() {
  return (<Shell allow={['student']} title="Student workspace"><StudentDashboard /></Shell>);
}
