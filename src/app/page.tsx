import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { homeFor, primaryRole } from '@/lib/scope';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const s = await getSession();
  if (!s) redirect('/login');
  redirect(homeFor(primaryRole(s)));
}
