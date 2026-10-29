// Aplica os dados de demonstração das funções de conformidade.
//   npm run db:valor                         → no banco de DATABASE_URL
//   tsx src/db/valor-cli.ts --ids ids.json   → só imprime o SQL (para aplicar em outro banco)
//   tsx src/db/valor-cli.ts --opcional       → usado no build da Vercel: nunca derruba o build
import "dotenv/config";
import { readFileSync } from "fs";
import { Pool } from "pg";
import { poolConfig } from "./config";
import { SQL_IDS, gerarSqlValor, type IdsValor } from "./valor";

const opcional = process.argv.includes("--opcional");

async function main() {
  if (opcional && !process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.log("Sem banco configurado; dados de demonstração ignorados.");
    return;
  }
  const i = process.argv.indexOf("--ids");
  if (i > 0) {
    const ids = JSON.parse(readFileSync(process.argv[i + 1], "utf8")) as IdsValor;
    process.stdout.write(gerarSqlValor(ids) + "\n");
    return;
  }
  const pool = new Pool(poolConfig());
  const { rows } = await pool.query(SQL_IDS);
  if (!rows[0]) {
    await pool.end();
    if (opcional) return console.log("Município de exemplo não encontrado; nada a fazer.");
    throw new Error("Município de exemplo não encontrado. Rode npm run db:seed antes.");
  }
  const sql = gerarSqlValor(rows[0].ids as IdsValor);
  // um único envio com begin/commit: funciona também no pooler em modo transação
  await pool.query(`begin;\n${sql}\ncommit;`);
  console.log(`Dados de conformidade aplicados (${sql.split("\n").length} comandos).`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(opcional ? 0 : 1);
});
