import { handler, json } from '@/lib/http';
import { requireSession } from '@/lib/auth';
import { primaryRole } from '@/lib/scope';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = handler(async () => {
  const s = await requireSession();
  return json({ user: { ...s, role: primaryRole(s) } });
});
