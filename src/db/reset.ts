// Apaga tudo e recria o esquema (uso em desenvolvimento). Executar: npm run db:reset
import "dotenv/config";
import { Pool } from "pg";
import { poolConfig } from "./config";
const pool = new Pool(poolConfig());
pool
  .query("drop schema if exists tramite cascade; drop schema if exists drizzle cascade;")
  .then(() => { console.log("Esquema recriado."); return pool.end(); })
  .catch((e) => { console.error(e); process.exit(1); });
