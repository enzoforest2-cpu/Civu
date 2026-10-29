import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { poolConfig } from "./config";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };
const pool = globalForDb.pool ?? new Pool(poolConfig());
globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
