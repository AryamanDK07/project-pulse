import { z } from 'zod';
import { handler, HttpError, json, parseBody } from '@/lib/http';
import { pool, withTransaction } from '@/lib/db';
import { requireSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* GET /api/users — admin/coordinator: every account with roles and status */
export const GET = handler(async () => {
  await requireSession(['coordinator', 'admin']);
  const { rows } = await pool.query(
    `SELECT u.user_id, u.email, u.full_name, u.enrollment_no, u.is_active, d.code AS department_code,
            array_agg(r.role_name ORDER BY r.role_name) AS roles
       FROM users u
       LEFT JOIN departments d ON d.department_id = u.department_id
       JOIN user_roles ur ON ur.user_id = u.user_id JOIN roles r ON r.role_id = ur.role_id
      GROUP BY u.user_id, d.code ORDER BY u.user_id`);
  return json({ users: rows });
});

/* POST /api/users — admin creates an account. The password is hashed INSIDE PostgreSQL
 * with bcrypt (pgcrypto crypt + gen_salt('bf')); plain text never reaches a table. */
const CreateBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).max(120),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
  role: z.enum(['student', 'faculty', 'reviewer', 'coordinator', 'admin']),
  enrollmentNo: z.string().trim().max(30).optional(),
  departmentId: z.number().int().positive().optional(),
});

export const POST = handler(async (req) => {
  const session = await requireSession(['admin']);
  const b = await parseBody(req, CreateBody);
  if (b.role === 'student' && !b.enrollmentNo) throw new HttpError(400, 'Students need an enrollment number');
  return json(await withTransaction(session.userId, async (c) => {
    const u = await c.query(
      `INSERT INTO users (email, password_hash, full_name, department_id, enrollment_no)
       VALUES ($1, crypt($2, gen_salt('bf')), $3, COALESCE($4, (SELECT MIN(department_id) FROM departments)), $5)
       RETURNING user_id, email, full_name`,
      [b.email, b.password, b.fullName, b.departmentId ?? null, b.role === 'student' ? b.enrollmentNo : null]);
    await c.query(
      'INSERT INTO user_roles (user_id, role_id) SELECT $1, role_id FROM roles WHERE role_name = $2',
      [u.rows[0].user_id, b.role]);
    await c.query(
      `INSERT INTO audit_logs (table_name, record_id, action, new_data, changed_by)
       VALUES ('users', $1, 'CREATE_USER', $2::jsonb, $3)`,
      [String(u.rows[0].user_id), JSON.stringify({ email: b.email, role: b.role }), session.userId]);
    return { user: { ...u.rows[0], role: b.role } };
  }), 201);
});

/* PUT /api/users — admin activates / deactivates an account (soft delete keeps history) */
const PutBody = z.object({ userId: z.number().int().positive(), isActive: z.boolean() });

export const PUT = handler(async (req) => {
  const session = await requireSession(['admin']);
  const b = await parseBody(req, PutBody);
  if (b.userId === session.userId && !b.isActive) throw new HttpError(400, 'You cannot deactivate your own account');
  return json(await withTransaction(session.userId, async (c) => {
    const r = await c.query('UPDATE users SET is_active = $2 WHERE user_id = $1 RETURNING user_id, is_active', [b.userId, b.isActive]);
    if (!r.rowCount) throw new HttpError(404, 'User not found');
    await c.query(
      `INSERT INTO audit_logs (table_name, record_id, action, new_data, changed_by)
       VALUES ('users', $1, $2, NULL, $3)`,
      [String(b.userId), b.isActive ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', session.userId]);
    return { user: r.rows[0] };
  }));
});
