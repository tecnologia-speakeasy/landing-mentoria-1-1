// Carga correos autorizados en mentoria.estudiantes_autorizados desde un CSV.
//
// Uso:
//   npm run db:load-emails              (usa db/emails.csv por defecto)
//   npm run db:load-emails -- otro.csv  (usa el archivo que indiques)
//
// El CSV puede tener un correo por línea, o varias columnas: se toma el primer
// campo que contenga "@". Líneas vacías y encabezados (sin @) se ignoran.
// Los correos se normalizan a minúsculas y los duplicados se omiten.

import nextEnv from "@next/env";
import { readFileSync } from "node:fs";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());

const file = process.argv[2] || "db/emails.csv";

let raw;
try {
  raw = readFileSync(file, "utf8");
} catch {
  console.error(`✗ No pude leer el archivo: ${file}`);
  console.error("  Crea db/emails.csv (un correo por línea) o pasa la ruta como argumento.");
  process.exit(1);
}

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emails = [];
const seen = new Set();
for (const line of raw.split(/\r?\n/)) {
  if (!line.trim()) continue;
  // Toma el primer campo (separado por coma o punto y coma) que parezca correo.
  const field = line
    .split(/[,;]/)
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .find((f) => f.includes("@"));
  if (!field) continue;
  const email = field.toLowerCase();
  if (!emailRegex.test(email) || seen.has(email)) continue;
  seen.add(email);
  emails.push(email);
}

if (emails.length === 0) {
  console.error("✗ No se encontró ningún correo válido en el archivo.");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL || "";
const client = new pg.Client({
  connectionString,
  ssl: /sslmode=require/.test(connectionString)
    ? { rejectUnauthorized: false }
    : false,
});

try {
  await client.connect();
  let inserted = 0;
  // Inserta con ON CONFLICT DO NOTHING (omite los que ya existen).
  for (const email of emails) {
    const r = await client.query(
      "INSERT INTO mentoria.estudiantes_autorizados (email) VALUES ($1) ON CONFLICT (email) DO NOTHING",
      [email]
    );
    inserted += r.rowCount;
  }
  const { rows } = await client.query(
    "SELECT count(*)::int AS total FROM mentoria.estudiantes_autorizados"
  );
  console.log(`✓ Correos en el archivo (válidos y únicos): ${emails.length}`);
  console.log(`✓ Nuevos insertados: ${inserted}  (omitidos por ya existir: ${emails.length - inserted})`);
  console.log(`✓ Total autorizados en la tabla: ${rows[0].total}`);
} catch (err) {
  console.error("✗ Error:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
