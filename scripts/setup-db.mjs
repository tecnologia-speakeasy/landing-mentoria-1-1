// Crea (o actualiza) el schema 'mentoria' en el Postgres definido por DATABASE_URL.
// Ejecuta, en orden alfabético, todos los archivos de db/sql/*.sql (son idempotentes).
// Uso:  npm run db:setup
//
// Carga las variables de entorno igual que Next.js (.env.local, .env, etc.).

import nextEnv from "@next/env";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlDir = join(__dirname, "..", "db", "sql");
const archivos = readdirSync(sqlDir).filter((f) => f.endsWith(".sql")).sort();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("✗ Falta DATABASE_URL (créala en .env.local).");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: /sslmode=require/.test(connectionString)
    ? { rejectUnauthorized: false }
    : false,
});

try {
  console.log("→ Conectando a la base de datos...");
  await client.connect();
  for (const archivo of archivos) {
    console.log(`→ Ejecutando db/sql/${archivo}...`);
    await client.query(readFileSync(join(sqlDir, archivo), "utf8"));
  }
  const { rows } = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'mentoria' ORDER BY table_name"
  );
  console.log("✓ Schema 'mentoria' listo. Tablas:");
  console.log("  " + rows.map((r) => r.table_name).join(", "));
} catch (err) {
  console.error("✗ Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
