import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { HttpError } from './http';

export type Role = 'student' | 'faculty' | 'reviewer' | 'coordinator' | 'admin';
export interface Session { userId: number; name: string; roles: Role[] }

const COOKIE = 'pulse_session';
const secret = () => {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is not set');
  return new TextEncoder().encode(s);
};

export async function createSession(s: Session): Promise<void> {
  const token = await new SignJWT({ name: s.name, roles: s.roles })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(s.userId))
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 8,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function destroySession(): Promise<void> { (await cookies()).delete(COOKIE); }

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { userId: Number(payload.sub), name: String(payload.name), roles: payload.roles as Role[] };
  } catch { return null; }
}

/** Throws 401/403 unless a session exists (and holds one of `roles`, if given). */
export async function requireSession(roles?: Role[]): Promise<Session> {
  const s = await getSession();
  if (!s) throw new HttpError(401, 'Unauthorized');
  if (roles && !s.roles.some((r) => roles.includes(r))) throw new HttpError(403, 'Forbidden for your role');
  return s;
}
