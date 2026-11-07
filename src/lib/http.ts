import { NextResponse } from 'next/server';
import { ZodError, type ZodTypeAny, type z } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });

export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try { raw = await req.json(); } catch { throw new HttpError(400, 'Request body must be valid JSON'); }
  return schema.parse(raw);
}

// SQLSTATE -> HTTP mapping so constraint violations surface as 4xx, not 500.
const PG_ERRORS: Record<string, [number, string]> = {
  '23505': [409, 'Duplicate record'],
  '23503': [400, 'Referenced record does not exist'],
  '23514': [400, 'Value violates a database constraint'],
  '22P02': [400, 'Malformed value'],
  '22007': [400, 'Invalid date'],
  '22008': [400, 'Date out of range'],
  '42501': [403, 'Operation not permitted'],
};

/** Wraps a route handler with uniform error handling. */
export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, details: err.details }, err.status);
      if (err instanceof ZodError) return json({ error: 'Validation failed', details: err.flatten() }, 400);
      const e = err as { code?: string; detail?: string; constraint?: string; message?: string };
      if (e.code && PG_ERRORS[e.code]) {
        const [status, msg] = PG_ERRORS[e.code];
        // Messages raised by our own triggers (no constraint name) are written for users — show them.
        const own = !e.constraint && (e.code === '23514' || e.code === '42501');
        return json({ error: own ? e.message : msg, details: e.detail ?? e.constraint }, status);
      }
      console.error(err);
      return json({ error: 'Internal server error' }, 500);
    }
  };
}
