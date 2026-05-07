import { drizzle } from 'drizzle-orm/neon-http';
import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import * as schema from './schema';

// Lazy SQL client: created on first DB call, not at module load.
// This keeps the build green even if DATABASE_URL is briefly absent
// (Next.js 16 turbopack imports route handlers during page-data
// collection — any module-level throw would fail the build).
let _sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set');
    }
    _sql = neon(url);
  }
  return _sql;
}

// Proxy that forwards both function calls (tagged-template) and
// property accesses (.query, .transaction) to the lazily-created
// underlying neon client. Drizzle uses both forms internally.
const lazySql = new Proxy(function () {} as unknown as object, {
  apply(_target, _thisArg, args: unknown[]) {
    const fn = getSql() as unknown as (...a: unknown[]) => unknown;
    return fn(...args);
  },
  get(_target, prop) {
    return Reflect.get(getSql() as unknown as object, prop);
  },
}) as unknown as NeonQueryFunction<false, false>;

export const db = drizzle(lazySql, { schema });
export { schema };
