import type { PoolConfig } from "pg";

/** Supabase e outros Postgres gerenciados exigem SSL; local não. */
export function poolConfig(url = process.env.DATABASE_URL): PoolConfig {
  if (!url) return { max: 1 }; // sem URL (ex.: durante o build) o pool só falha se alguém consultar
  const local = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url);
  // remove sslmode da URL para controlar o SSL pelo objeto (evita erro de cadeia de certificado do pooler)
  const limpa = url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
  return {
    connectionString: limpa,
    ssl: local ? false : { rejectUnauthorized: false },
    max: process.env.VERCEL ? 3 : 10,
    idleTimeoutMillis: 10_000,
  };
}

