'use client';
import FacultyDashboard from '@/components/FacultyDashboard';
import { Shell } from '@/components/ui';

export default function Page() {
  return (<Shell allow={['faculty', 'coordinator', 'admin']} title="Faculty guide dashboard"><FacultyDashboard /></Shell>);
}
