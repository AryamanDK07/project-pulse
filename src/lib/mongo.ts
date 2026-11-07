import mongoose from 'mongoose';

const g = globalThis as unknown as { __pulseMongo?: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } };
const cache = (g.__pulseMongo ??= { conn: null, promise: null });

export async function connectMongo(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  cache.promise ??= mongoose.connect(uri, { bufferCommands: false, serverSelectionTimeoutMS: 5000 });
  cache.conn = await cache.promise;
  return cache.conn;
}
