// Prepara o banco em cada deploy (e localmente):
//   1. aplica as migrações pendentes (drizzle), registrando a base já existente na primeira vez;
//   2. se a versão dos dados de demonstração mudou, recria o município de exemplo.
//   tsx src/db/deploy.ts            → migra e atualiza a demonstração se preciso
//   tsx src/db/deploy.ts --forcar   → recria a demonstração mesmo na mesma versão
//   tsx src/db/deploy.ts --opcional → usado no build da Vercel: sem banco, não faz nada
import "dotenv/config";
import Module from "module";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";

// o motor é código de servidor do Next; fora dele, neutraliza os módulos que só existem lá
const M = Module as unknown as { _load: (req: string, ...a: unknown[]) => unknown };
const origLoad = M._load;
M._load = function (req: string, ...a: unknown[]) {
  if (req === "server-only") return {};
  if (req === "next/headers") return { cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) };
  if (req === "next/navigation") return { redirect: () => { throw new Error("REDIRECT"); } };
  return origLoad.call(this, req, ...a);
};

const opcional = process.argv.includes("--opcional");
const forcar = process.argv.includes("--forcar");
const PASTA = path.join(process.cwd(), "drizzle");

async function main() {
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    if (opcional) return console.log("Sem banco configurado; preparo do banco ignorado.");
    throw new Error("Defina DATABASE_URL.");
  }
  const { db } = await import("./index");
  const { sql } = await import("drizzle-orm");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const q = async <T = Record<string, unknown>>(s: string) => (await db.execute(sql.raw(s))).rows as T[];

  // 1. base criada antes do migrador (Supabase apply_migration): marca a 0000 como aplicada
  await q(`create schema if not exists drizzle;
    create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`);
  const [{ n }] = await q<{ n: number }>(`select count(*)::int n from drizzle.__drizzle_migrations`);
  const [{ existe }] = await q<{ existe: boolean }>(`select to_regclass('tramite.municipios') is not null existe`);
  if (n === 0 && existe) {
    const journal = JSON.parse(readFileSync(path.join(PASTA, "meta/_journal.json"), "utf8")) as { entries: { tag: string; when: number }[] };
    const primeira = journal.entries[0];
    const hash = createHash("sha256").update(readFileSync(path.join(PASTA, `${primeira.tag}.sql`), "utf8")).digest("hex");
    await q(`insert into drizzle.__drizzle_migrations (hash, created_at) values ('${hash}', ${primeira.when})`);
    console.log(`Base existente registrada (${primeira.tag}).`);
  }
  await migrate(db, { migrationsFolder: PASTA });
  console.log("Migrações em dia.");

  // 2. dados de demonstração versionados
  const { DEMO_VERSAO, MODULOS_DEMO } = await import("./demo");
  await q(`create table if not exists tramite.demo_versao (id int primary key default 1, versao int not null, aplicada_em timestamptz not null default now())`);
  const atual = (await q<{ versao: number }>(`select versao from tramite.demo_versao where id = 1`))[0]?.versao ?? 0;
  if (atual >= DEMO_VERSAO && !forcar) return console.log(`Demonstração na versão ${atual}; nada a fazer.`);

  const tabelas = (await q<{ t: string }>(`select tablename t from pg_tables where schemaname = 'tramite' and tablename <> 'demo_versao'`)).map((r) => `tramite."${r.t}"`);
  if (tabelas.length) await q(`truncate ${tabelas.join(", ")} restart identity cascade`);

  const { seedBase } = await import("./seed");
  const ctx = await seedBase(db);
  console.log("Município de exemplo criado.");

  const { SQL_IDS, gerarSqlValor } = await import("./valor");
  const { Pool } = await import("pg");
  const { poolConfig } = await import("./config");
  const pool = new Pool(poolConfig());
  const { rows } = await pool.query(SQL_IDS);
  if (rows[0]) {
    await pool.query(`begin;\n${gerarSqlValor(rows[0].ids)}\ncommit;`);
    console.log("Dados de conformidade aplicados.");
  }
  await pool.end();

  for (const m of MODULOS_DEMO) {
    await m.aplicar(ctx);
    console.log(`Demonstração: ${m.nome}.`);
  }
  await q(`insert into tramite.demo_versao (id, versao) values (1, ${DEMO_VERSAO}) on conflict (id) do update set versao = excluded.versao, aplicada_em = now()`);
  console.log(`Demonstração atualizada para a versão ${DEMO_VERSAO}.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(opcional ? 0 : 1);
  });
