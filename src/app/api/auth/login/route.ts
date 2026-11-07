import { z } from 'zod';
import { handler, HttpError, json, parseBody } from '@/lib/http';
import { pool } from '@/lib/db';
import { createSession, type Role } from '@/lib/auth';
import { homeFor, primaryRole } from '@/lib/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ email: z.string().email(), password: z.string().min(1) });

export const POST = handler(async (req) => {
  const { email, password } = await parseBody(req, Body);
  // Password check happens inside PostgreSQL: crypt(plain, stored_hash) = stored_hash.
  const { rows } = await pool.query(
    `SELECT u.user_id, u.full_name, ARRAY_AGG(r.role_name) AS roles
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
      WHERE lower(u.email) = lower($1) AND u.is_active AND u.password_hash = crypt($2, u.password_hash)
      GROUP BY u.user_id`, [email, password]);
  if (!rows.length) throw new HttpError(401, 'Invalid email or password');
  const session = { userId: Number(rows[0].user_id), name: rows[0].full_name as string, roles: rows[0].roles as Role[] };
  await createSession(session);
  const role = primaryRole(session);
  return json({ user: session, role, home: homeFor(role) });
});
