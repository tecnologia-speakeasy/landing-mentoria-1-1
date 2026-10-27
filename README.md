# Mentoría 1:1 · Speak Easy

Landing para que los estudiantes agenden una sesión de mentoría 1:1 con un profesor.
Sigue la misma estructura que el sistema de evaluación (`Evaluaciondos-main`), pero
solo con el módulo de agendamiento.

## Flujo

1. **Login** (`/`): nombre + correo. El correo debe estar en `mentoria.estudiantes_autorizados`.
2. **Menú**: un único botón, **Agenda tu mentoría**.
3. **Agendar** (`/agendar`): el estudiante elige día y hora. El sistema asigna
   automáticamente el profesor disponible en ese horario con menos mentorías
   (desempate aleatorio), crea la reunión de Zoom y envía la confirmación.
   Cada estudiante puede tener **una** mentoría activa.

## Estructura

```
app/
  page.tsx                 → login + menú (app/components/Inicio.tsx)
  agendar/page.tsx         → selección de día/hora y confirmación
  api/login                → valida correo autorizado y crea la sesión
  api/logout, api/session  → cerrar / consultar sesión
  api/slots                → horarios con cupo + mentoría activa del estudiante
  api/reservar             → reserva atómica y asignación de profesor
lib/agenda/                → config, sesión, BD, reservas, Zoom, notificaciones
lib/email.ts, manychat.ts  → correo SMTP y WhatsApp (opcionales)
db/sql/001_init.sql        → schema 'mentoria'
scripts/                   → setup de BD, carga de profesores y de correos, prueba Zoom
```

## Base de datos (schema `mentoria`)

Vive en la misma base de datos que el sistema de evaluación, aislada en su propio
schema. No lee ni modifica las tablas de `agendamiento`.

| Tabla | Contenido |
| --- | --- |
| `profesores` | nombre, slug, foto, credenciales Zoom, activo |
| `disponibilidad` | franjas semanales por profesor (día ISO 1–7 + hora inicio) |
| `estudiantes_autorizados` | lista blanca de correos (y `manychat_id` opcional) |
| `estudiantes` | estudiantes que han ingresado (nombre capturado en el login) |
| `citas` | mentorías agendadas (profesor, estudiante, fecha, hora, Zoom) |

## Puesta en marcha

```bash
npm install
cp .env.example .env.local     # rellenar DATABASE_URL y SESSION_SECRET
npm run db:setup               # crea el schema 'mentoria' (idempotente)
npm run dev
```

Sin profesores ni disponibilidad cargados, `/agendar` muestra "Aún no hay horarios
disponibles". Con `MEETING_PROVIDER=placeholder` y `NOTIFIER=log` se puede probar
todo el flujo sin Zoom ni correo.

## Datos pendientes (cuando estén listos)

**Profesores y disponibilidad**

```bash
cp db/profesores.example.json db/profesores.json   # rellenar
npm run db:seed
```

La disponibilidad se escribe por día con rangos en hora de Colombia
(`"lun": ["08:00-12:00", "14:00-18:00"]`). Fotos en `public/profesores/`.
Las credenciales de Zoom se actualizan directo en `mentoria.profesores` y se
verifican con `npm run zoom:test`.

**Estudiantes autorizados**

```bash
# db/emails.csv: un correo por línea (no se sube a git)
npm run db:load-emails
```

Para probar antes de tener la lista real, carga tu propio correo.

## Notificaciones

Al agendar (después de guardar la cita; si alguna falla, la cita queda igual):

- **Correo** al estudiante según `NOTIFIER` (`email` = SMTP, `log` = consola).
- **WhatsApp por GoHighLevel**: POST a `GHL_WEBHOOK_CITA` (trigger *Inbound Webhook*
  de un workflow). El workflow busca al contacto por `estudianteEmail` y le envía una
  plantilla de WhatsApp aprobada. El contacto debe existir en GoHighLevel con su
  teléfono: la app no pide teléfono.
- **n8n**: POST a `N8N_WEBHOOK_CITA` (p.ej. para el Google Sheet del profesor).
  `npm run n8n:test` envía una mentoría de ejemplo; con una URL `/webhook-test/`,
  antes pulsar *Listen for test event* en el nodo Webhook de n8n.
- **ManyChat** (opcional): si hay `MANYCHAT_API_TOKEN` y el estudiante tiene `manychat_id`.

Los webhooks reciben este JSON:

```json
{
  "evento": "mentoria_agendada",
  "citaId": 12,
  "profesor": "Nombre del profesor",
  "profesorId": 3,
  "estudianteNombre": "María García",
  "estudianteEmail": "maria@example.com",
  "fecha": "2026-11-03",
  "hora": "18:00",
  "cuando": "martes 3 nov · 6:00 PM",
  "cuandoLocal": "martes 3 nov · 7:00 PM",
  "tz": "America/New_York",
  "joinUrl": "https://zoom.us/j/...",
  "token": "Ab3dEf6hIj9k"
}
```

`fecha`, `hora` y `cuando` están en hora de Colombia; `cuandoLocal` en la del estudiante.

**Enlace corto para unirse:** `https://<dominio-de-la-landing>/unirse/<token>` redirige
al Zoom de la cita (o muestra un aviso si no existe o fue cancelada). Hoy la plantilla
envía el `joinUrl` directo en el cuerpo; el enlace corto queda disponible por si se
pasa a un botón "Unirse" con URL dinámica (Meta solo permite una variable al final de
la URL del botón y el enlace de Zoom cambia de dominio según la cuenta del profesor).

**Configurar GoHighLevel**

1. Crear un workflow con el trigger **Inbound Webhook** y copiar su URL en
   `GHL_WEBHOOK_CITA` (`.env.local` y Vercel).
2. `npm run ghl:test -- correo@de.prueba.com` envía una mentoría de ejemplo para que
   GoHighLevel capture los campos; mapear el contacto por `estudianteEmail`.
3. Crear campos personalizados de contacto (texto) para la mentoría y llenarlos en la
   acción *Create/Update Contact* con `profesor`, `cuandoLocal` y `joinUrl`.
4. Agregar la acción de WhatsApp con la plantilla aprobada. Sus variables apuntan a
   esos campos: `{{1}}` = nombre, `{{2}}` = profesor, `{{3}}` = fecha y hora,
   `{{4}}` = enlace de Zoom en el cuerpo.
5. Publicar el workflow.

Si se cambia el JSON (p.ej. un campo nuevo), volver a correr `npm run ghl:test` y
re-seleccionar la *Mapping Reference* del trigger.
