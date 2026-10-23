// Prueba la conexión con Zoom usando las credenciales guardadas en la base
// (mentoria.profesores). NO expone credenciales: las lee de la DB.
//
// Verifica, por cada profesor activo:
//   1) que el token OAuth Server-to-Server funcione con SUS credenciales,
//   2) que su usuario exista en Zoom y si tiene licencia (Pro = sin límite 40min),
//   3) con --meeting: crea y borra una reunión de prueba (solo el primero).
//
// Uso:  npm run zoom:test          (solo token + usuarios)
//       npm run zoom:test -- --meeting   (además crea/borra una reunión real)

import nextEnv from "@next/env";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());

const conMeeting = process.argv.includes("--meeting");

async function getToken({ accountId, clientId, clientSecret }) {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const r = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    { method: "POST", headers: { Authorization: `Basic ${basic}` } }
  );
  if (!r.ok) throw new Error(`OAuth ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).access_token;
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const profes = (
  await c.query(
    `SELECT id, nombre, zoom_account_id, zoom_client_id, zoom_client_secret, zoom_user_email
     FROM mentoria.profesores WHERE activo = true ORDER BY id`
  )
).rows;
await c.end();

let ok = 0;
let creado = false;
for (const p of profes) {
  if (!p.zoom_account_id || !p.zoom_client_id || !p.zoom_client_secret) {
    console.log(`✗ ${p.nombre}: faltan credenciales Zoom`);
    continue;
  }
  let token;
  try {
    token = await getToken({
      accountId: p.zoom_account_id,
      clientId: p.zoom_client_id,
      clientSecret: p.zoom_client_secret,
    });
  } catch (e) {
    console.log(`✗ ${p.nombre}: token falló -> ${e.message}`);
    continue;
  }

  const email = p.zoom_user_email ?? "me";
  const r = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    console.log(`✗ ${p.nombre} (${email}): usuario -> ${r.status} ${(await r.text()).slice(0, 120)}`);
    continue;
  }
  const u = await r.json();
  const tipo =
    u.type === 1 ? "Básico (límite 40min ⚠)" : u.type === 2 ? "Licenciado (Pro)" : `tipo ${u.type}`;
  console.log(`✓ ${p.nombre} · ${email} -> token OK, ${tipo}`);
  ok++;

  if (conMeeting && !creado) {
    creado = true;
    // Mañana a las 15:00 (Colombia), para que la reunión de prueba no quede en el pasado.
    const manana = new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", {
      timeZone: "America/Bogota",
    });
    const cr = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(email)}/meetings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: "Prueba Mentoría Speak Easy (borrar)",
        type: 2,
        start_time: `${manana}T15:00:00`,
        duration: 30,
        timezone: "America/Bogota",
        settings: { waiting_room: true },
      }),
    });
    if (!cr.ok) {
      console.log(`    ✗ crear reunión: ${cr.status} ${(await cr.text()).slice(0, 180)}`);
    } else {
      const m = await cr.json();
      console.log(`    ✓ reunión de prueba creada: ${m.join_url}`);
      const del = await fetch(`https://api.zoom.us/v2/meetings/${m.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log(del.ok ? "    ✓ reunión de prueba eliminada" : `    ! no se pudo borrar (${del.status})`);
    }
  }
}
console.log(`\nResumen: ${ok}/${profes.length} profesores con Zoom OK`);
