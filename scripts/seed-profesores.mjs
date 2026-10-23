// Carga los profesores y su disponibilidad semanal desde un JSON.
//
// Uso:
//   npm run db:seed              (usa db/profesores.json por defecto)
//   npm run db:seed -- otro.json (usa el archivo que indiques)
//
// Formato: ver db/profesores.example.json. Por cada profesor del archivo:
//   - se crea o actualiza (por slug) su nombre y foto, y queda activo;
//   - su disponibilidad se REEMPLAZA por la del archivo.
// Los profesores que ya están en la base y no aparecen en el archivo no se tocan
// (para retirarlos: UPDATE mentoria.profesores SET activo = false WHERE slug = '...').
// Todo corre en una transacción: si algo falla, no se aplica nada.

import nextEnv from "@next/env";
import { readFileSync } from "node:fs";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());

const file = process.argv[2] || "db/profesores.json";
// Misma duración de slot que usa la app (lib/agenda/config.ts).
const STEP_MIN = parseInt(process.env.BOOKING_SLOT_STEP_MIN ?? "30", 10);
const DIAS = { lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6, dom: 7 };

let data;
try {
  data = JSON.parse(readFileSync(file, "utf8"));
} catch (err) {
  console.error(`✗ No pude leer ${file}: ${err.message}`);
  console.error("  Copia db/profesores.example.json a db/profesores.json y rellénalo.");
  process.exit(1);
}

const toMin = (s) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`hora inválida "${s}" (usa HH:MM)`);
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};
const fmt = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// "08:00-12:00" -> ["08:00", "08:30", ..., "11:30"] (fin exclusivo).
function expandirRango(rango) {
  const [ini, fin] = rango.split("-");
  if (!ini || !fin) throw new Error(`rango inválido "${rango}" (usa HH:MM-HH:MM)`);
  const a = toMin(ini);
  const b = toMin(fin);
  if (b <= a) throw new Error(`rango inválido "${rango}" (el fin debe ser mayor al inicio)`);
  if ((a % STEP_MIN) !== 0) {
    throw new Error(`rango "${rango}": el inicio debe caer en la rejilla de ${STEP_MIN} min`);
  }
  const out = [];
  for (let m = a; m + STEP_MIN <= b; m += STEP_MIN) out.push(fmt(m));
  return out;
}

// Valida y normaliza todo ANTES de tocar la base.
const profesores = [];
try {
  if (!Array.isArray(data.profesores) || data.profesores.length === 0) {
    throw new Error('el archivo no tiene una lista "profesores"');
  }
  const slugs = new Set();
  for (const p of data.profesores) {
    const nombre = String(p.nombre ?? "").trim();
    const slug = String(p.slug ?? "").trim();
    if (!nombre || !slug) throw new Error("cada profesor necesita nombre y slug");
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new Error(`slug "${slug}" inválido (solo minúsculas, números y guiones)`);
    }
    if (slugs.has(slug)) throw new Error(`slug repetido: ${slug}`);
    slugs.add(slug);

    const franjas = []; // [dia_semana, "HH:MM"]
    for (const [dia, rangos] of Object.entries(p.disponibilidad ?? {})) {
      const dow = DIAS[dia];
      if (!dow) throw new Error(`${slug}: día "${dia}" inválido (usa ${Object.keys(DIAS).join(", ")})`);
      const horas = new Set();
      for (const rango of rangos) {
        for (const h of expandirRango(rango)) horas.add(h);
      }
      for (const h of horas) franjas.push([dow, h]);
    }
    profesores.push({ nombre, slug, fotoUrl: p.foto_url || null, franjas });
  }
} catch (err) {
  console.error(`✗ ${file}: ${err.message}`);
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
  await client.query("BEGIN");
  for (const p of profesores) {
    const { rows } = await client.query(
      `INSERT INTO mentoria.profesores (nombre, slug, foto_url, activo)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (slug) DO UPDATE
         SET nombre = EXCLUDED.nombre, foto_url = EXCLUDED.foto_url, activo = true
       RETURNING id`,
      [p.nombre, p.slug, p.fotoUrl]
    );
    const id = rows[0].id;
    await client.query("DELETE FROM mentoria.disponibilidad WHERE profesor_id = $1", [id]);
    for (const [dow, hora] of p.franjas) {
      await client.query(
        `INSERT INTO mentoria.disponibilidad (profesor_id, dia_semana, hora_inicio)
         VALUES ($1, $2, $3::time)`,
        [id, dow, hora]
      );
    }
    console.log(`✓ ${p.nombre} (${p.slug}): ${p.franjas.length} franjas de ${STEP_MIN} min`);
  }
  await client.query("COMMIT");
  const { rows } = await client.query(
    "SELECT count(*)::int AS total FROM mentoria.profesores WHERE activo = true"
  );
  console.log(`✓ Profesores activos en la base: ${rows[0].total}`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("✗ Error (no se aplicó ningún cambio):", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
