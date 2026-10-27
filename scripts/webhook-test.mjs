// Envía una mentoría de EJEMPLO al webhook de GoHighLevel (GHL_WEBHOOK_CITA) o
// de n8n (N8N_WEBHOOK_CITA), con el mismo formato que envía la app al agendar
// (lib/agenda/booking.ts). Sirve para que GoHighLevel/n8n capturen los campos y
// se puedan mapear en el workflow sin hacer una reserva real.
//
// Uso:  npm run ghl:test                      (correo de ejemplo)
//       npm run ghl:test -- correo@real.com   (correo de un contacto de prueba)
//       npm run n8n:test                      (igual, pero a N8N_WEBHOOK_CITA)
//
// OJO: si el workflow ya está publicado y el correo es de un contacto real,
// GoHighLevel le enviará el WhatsApp de verdad.
// En n8n, una URL /webhook-test/ solo responde mientras el editor está en
// "Listen for test event", y recibe una sola llamada por cada escucha.

import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const args = process.argv.slice(2);
const esN8n = args.includes("--n8n");
const destino = esN8n ? "n8n" : "GoHighLevel";
const variable = esN8n ? "N8N_WEBHOOK_CITA" : "GHL_WEBHOOK_CITA";
const url = process.env[variable];
const secret = esN8n ? process.env.N8N_WEBHOOK_SECRET : undefined;
if (!url) {
  console.error(`✗ Falta ${variable} en .env.local (la URL del webhook de ${destino}).`);
  process.exit(1);
}

const email = args.find((a) => !a.startsWith("--")) || "estudiante.prueba@example.com";
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
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "x-webhook-secret": secret } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.text()).slice(0, 250);
  if (!res.ok) {
    console.error(`✗ ${destino} respondió ${res.status}: ${body}`);
    if (esN8n && res.status === 404 && url.includes("/webhook-test/")) {
      console.error('  Abre el workflow en n8n, pulsa "Listen for test event" en el nodo Webhook y vuelve a correrlo.');
    }
    process.exitCode = 1;
  } else {
    console.log(`✓ Enviado a ${destino} (${res.status}) con estudianteEmail=${email}`);
    // GoHighLevel responde con un ID que sirve para ubicar la solicitud en
    // "Mapping Reference"; n8n, con lo que devuelva su nodo Webhook.
    if (body) console.log(`  Respuesta de ${destino}: ${body}`);
    console.log("  En el workflow, ya puedes mapear los campos recibidos.");
  }
} catch (err) {
  console.error("✗ No se pudo enviar:", err.message);
  process.exitCode = 1;
}
