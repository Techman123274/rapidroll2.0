import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI is required');
}

type Cached = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __mongoose_cache__: Cached | undefined;
}

const cached: Cached = global.__mongoose_cache__ || { conn: null, promise: null };

global.__mongoose_cache__ = cached;

export async function connectDb() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      maxPoolSize: 20,
      minPoolSize: 2
    });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
