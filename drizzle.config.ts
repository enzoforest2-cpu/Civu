import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  schemaFilter: ["tramite"],
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
