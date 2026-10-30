import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  schemaFilter: ["tramite"],
  out: "./drizzle",
  dbCredentials: { url: (process.env.DATABASE_URL || process.env.POSTGRES_URL)! },
});
