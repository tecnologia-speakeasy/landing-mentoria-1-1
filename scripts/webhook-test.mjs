// Envía una mentoría de EJEMPLO al webhook de GoHighLevel (GHL_WEBHOOK_CITA),
// con el mismo formato que envía la app al agendar (lib/agenda/booking.ts).
// Sirve para que GoHighLevel capture los campos y se puedan mapear en el
// workflow (trigger "Inbound Webhook") sin hacer una reserva real.
//
// Uso:  npm run ghl:test                      (correo de ejemplo)
//       npm run ghl:test -- correo@real.com   (correo de un contacto de prueba)
//
// OJO: si el workflow ya está publicado y el correo es de un contacto real,
// GoHighLevel le enviará el WhatsApp de verdad.

import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.GHL_WEBHOOK_CITA;
if (!url) {
  console.error("✗ Falta GHL_WEBHOOK_CITA en .env.local (la URL que da el trigger Inbound Webhook).");
  process.exit(1);
}

const email = process.argv[2] || "estudiante.prueba@example.com";
const payload = {
  evento: "mentoria_agendada",
  citaId: 0,
  profesor: "Profesor de Prueba",
  profesorId: 0,
  estudianteNombre: "Estudiante de Prueba",
  estudianteEmail: email,
  fecha: "2026-11-03",
  hora: "18:00",
  cuando: "martes 3 nov · 6:00 PM",
  cuandoLocal: "martes 3 nov · 6:00 PM",
  tz: "America/Bogota",
  joinUrl: "https://example.com/zoom-de-prueba",
  token: "Ab3dEf6hIj9k",
};

try {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.text()).slice(0, 250);
  if (!res.ok) {
    console.error(`✗ GoHighLevel respondió ${res.status}: ${body}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ Enviado (${res.status}) con estudianteEmail=${email}`);
    // GoHighLevel responde con un ID que sirve para ubicar la solicitud en
    // "Mapping Reference".
    if (body) console.log(`  Respuesta de GoHighLevel: ${body}`);
    console.log("  En el workflow, ya puedes mapear los campos recibidos.");
  }
} catch (err) {
  console.error("✗ No se pudo enviar:", err.message);
  process.exitCode = 1;
}
