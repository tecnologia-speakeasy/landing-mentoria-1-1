import { query, withTx } from "./db";
import { bookingDates, BOOKING_SLOTS, SLOT_DURATION_MIN, slotLabel, isoDow, slotReservable } from "./config";
import { getMeetingProvider, type MeetingInput } from "./meeting";
import { getNotifier } from "./notifier";
import { enviarWhatsApp, manychatConfigurado } from "@/lib/manychat";

export type SlotInfo = {
  fechaISO: string;
  hora: string; // "HH:MM"
  cupos: number; // profesores libres en ese slot
  disponible: boolean;
};

export type CitaDetalle = {
  id: number;
  fechaISO: string;
  hora: string; // "HH:MM"
  estado: string;
  joinUrl: string | null;
  profesor: { id: number; nombre: string; fotoUrl: string | null };
};

type ProfesorRow = {
  id: number;
  nombre: string;
  foto_url: string | null;
  zoom_account_id: string | null;
  zoom_client_id: string | null;
  zoom_client_secret: string | null;
  zoom_user_email: string | null;
};

export class BookingError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

// Lista los slots de la ventana donde al menos un profesor atiende ese día+hora,
// con sus cupos libres. La capacidad por slot la define la disponibilidad real.
// Sin profesores/disponibilidad cargados devuelve [] (la UI muestra "sin horarios").
export async function listarSlots(): Promise<SlotInfo[]> {
  // Capacidad por (dia_semana, hora) = profesores ACTIVOS disponibles.
  const capRows = await query<{ dow: number; hora: string; cap: number }>(
    `SELECT d.dia_semana AS dow,
            to_char(d.hora_inicio,'HH24:MI') AS hora,
            COUNT(*)::int AS cap
     FROM mentoria.disponibilidad d
     JOIN mentoria.profesores p ON p.id = d.profesor_id AND p.activo = true
     GROUP BY 1, 2`
  );
  const capPorDowHora = new Map<string, number>();
  for (const r of capRows) capPorDowHora.set(`${r.dow}|${r.hora}`, Number(r.cap));

  // Ocupación por (fecha, hora) de citas confirmadas.
  const ocupacion = await query<{ fecha: string; hora: string; n: number }>(
    `SELECT to_char(fecha,'YYYY-MM-DD') AS fecha,
            to_char(hora_inicio,'HH24:MI') AS hora,
            COUNT(*)::int AS n
     FROM mentoria.citas
     WHERE estado = 'confirmada'
     GROUP BY 1, 2`
  );
  const ocupadosPorSlot = new Map<string, number>();
  for (const r of ocupacion) ocupadosPorSlot.set(`${r.fecha}|${r.hora}`, Number(r.n));

  const ahora = Date.now(); // para descartar slots pasados o a menos de 2h
  const slots: SlotInfo[] = [];
  for (const fechaISO of bookingDates(ahora)) {
    const dow = isoDow(fechaISO);
    for (const hora of BOOKING_SLOTS) {
      const cap = capPorDowHora.get(`${dow}|${hora}`) ?? 0;
      if (cap === 0) continue; // nadie atiende ese día+hora -> no se ofrece
      // Ya pasó o falta menos de la antelación mínima -> no se ofrece. (La
      // ventana empieza hoy, así que sin esto el día actual se llenaría de
      // horarios tachados.)
      if (!slotReservable(fechaISO, hora, ahora)) continue;
      const ocupados = ocupadosPorSlot.get(`${fechaISO}|${hora}`) ?? 0;
      const cupos = Math.max(0, cap - ocupados);
      // Sin cupos se muestra tachado.
      slots.push({ fechaISO, hora, cupos, disponible: cupos > 0 });
    }
  }
  return slots;
}

function esSlotValido(fechaISO: string, hora: string): boolean {
  return bookingDates().includes(fechaISO) && BOOKING_SLOTS.includes(hora);
}

// Cita activa del estudiante (si tiene).
export async function citaDeEstudiante(estudianteId: number): Promise<CitaDetalle | null> {
  const rows = await query<{
    id: number; fecha: string; hora: string; estado: string; join_url: string | null;
    pid: number; pnombre: string; pfoto: string | null;
  }>(
    `SELECT c.id,
            to_char(c.fecha,'YYYY-MM-DD') AS fecha,
            to_char(c.hora_inicio,'HH24:MI') AS hora,
            c.estado, c.zoom_join_url AS join_url,
            p.id AS pid, p.nombre AS pnombre, p.foto_url AS pfoto
     FROM mentoria.citas c
     JOIN mentoria.profesores p ON p.id = c.profesor_id
     WHERE c.estudiante_id = $1 AND c.estado = 'confirmada'
     LIMIT 1`,
    [estudianteId]
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    fechaISO: r.fecha,
    hora: r.hora,
    estado: r.estado,
    joinUrl: r.join_url,
    profesor: { id: r.pid, nombre: r.pnombre, fotoUrl: r.pfoto },
  };
}

// =============================================================================
// Reserva atómica con asignación equitativa.
// =============================================================================
export async function reservar(params: {
  estudianteId: number;
  estudianteNombre: string;
  estudianteEmail: string;
  fechaISO: string;
  hora: string; // "HH:MM"
  tz?: string; // zona horaria del estudiante (para mostrar hora local en avisos)
}): Promise<CitaDetalle> {
  const { estudianteId, estudianteNombre, estudianteEmail, fechaISO, hora, tz } = params;

  if (!esSlotValido(fechaISO, hora)) {
    throw new BookingError("slot_invalido", "Ese horario no está disponible para agendar.");
  }
  // No se puede agendar un horario ya pasado o que falte menos de 2h.
  if (!slotReservable(fechaISO, hora)) {
    throw new BookingError(
      "slot_muy_pronto",
      "Ese horario ya no se puede agendar. Debes reservar con al menos 2 horas de anticipación."
    );
  }
  const dow = isoDow(fechaISO);
  const horaStr = `${hora}:00`; // "06:30:00"

  const cita = await withTx(async (c) => {
    // Serializamos por slot y por estudiante (orden fijo: slot, luego estudiante)
    // para que el cálculo de "profe libre con menor carga" sea consistente y
    // un estudiante no pueda agendar dos veces por doble clic.
    await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`mentoria:slot:${fechaISO}:${hora}`]);
    await c.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`mentoria:est:${estudianteId}`]);

    // El estudiante no debe tener ya una cita activa.
    const yaTiene = await c.query(
      `SELECT 1 FROM mentoria.citas WHERE estudiante_id = $1 AND estado = 'confirmada' LIMIT 1`,
      [estudianteId]
    );
    if (yaTiene.rowCount && yaTiene.rowCount > 0) {
      throw new BookingError("ya_agendo", "Ya tienes una mentoría agendada.");
    }

    // Profesor activo, DISPONIBLE ese día+hora, libre en el slot, con MENOR carga
    // total; desempate aleatorio.
    const cand = await c.query<ProfesorRow & { carga: string }>(
      `SELECT p.id, p.nombre, p.foto_url,
              p.zoom_account_id, p.zoom_client_id, p.zoom_client_secret, p.zoom_user_email,
              COUNT(c2.id) FILTER (WHERE c2.estado = 'confirmada') AS carga
       FROM mentoria.profesores p
       LEFT JOIN mentoria.citas c2 ON c2.profesor_id = p.id
       WHERE p.activo = true
         AND EXISTS (
           SELECT 1 FROM mentoria.disponibilidad d
           WHERE d.profesor_id = p.id
             AND d.dia_semana = $3 AND d.hora_inicio = $2::time
         )
         AND NOT EXISTS (
           SELECT 1 FROM mentoria.citas b
           WHERE b.profesor_id = p.id
             AND b.fecha = $1::date AND b.hora_inicio = $2::time
             AND b.estado = 'confirmada'
         )
       GROUP BY p.id
       ORDER BY carga ASC, random()
       LIMIT 1`,
      [fechaISO, horaStr, dow]
    );
    const profesor = cand.rows[0];
    if (!profesor) {
      throw new BookingError("sin_cupo", "No quedan profesores disponibles en ese horario.");
    }

    // Crear la reunión (Zoom o placeholder) ANTES de insertar: si falla, rollback.
    const meetingInput: MeetingInput = {
      profesor: {
        id: profesor.id,
        nombre: profesor.nombre,
        zoomAccountId: profesor.zoom_account_id,
        zoomClientId: profesor.zoom_client_id,
        zoomClientSecret: profesor.zoom_client_secret,
        zoomUserEmail: profesor.zoom_user_email,
      },
      estudianteNombre,
      fechaISO,
      hora,
      durationMin: SLOT_DURATION_MIN,
    };
    const meeting = await getMeetingProvider().crear(meetingInput);

    const ins = await c.query<{ id: number }>(
      `INSERT INTO mentoria.citas
         (profesor_id, estudiante_id, fecha, hora_inicio, duracion_min,
          zoom_meeting_id, zoom_join_url, zoom_start_url)
       VALUES ($1, $2, $3::date, $4::time, $5, $6, $7, $8)
       RETURNING id`,
      [
        profesor.id, estudianteId, fechaISO, horaStr, SLOT_DURATION_MIN,
        meeting.meetingId, meeting.joinUrl, meeting.startUrl,
      ]
    );

    return {
      id: ins.rows[0].id,
      fechaISO,
      hora,
      estado: "confirmada",
      joinUrl: meeting.joinUrl,
      profesor: { id: profesor.id, nombre: profesor.nombre, fotoUrl: profesor.foto_url },
    } satisfies CitaDetalle;
  });

  // Notificación fuera de la transacción (no debe bloquear ni revertir la cita).
  try {
    await getNotifier().enviarConfirmacion({
      estudianteNombre,
      estudianteEmail,
      profesorNombre: cita.profesor.nombre,
      fechaISO,
      hora,
      joinUrl: cita.joinUrl ?? "",
      tz,
    });
  } catch (e) {
    console.error("[reservar] notificación falló (cita ya creada):", e);
  }

  // WhatsApp por ManyChat (best-effort): busca el manychat_id del estudiante.
  try {
    const flowNs = process.env.MANYCHAT_FLOW_CITA;
    if (flowNs && manychatConfigurado()) {
      const r = await query<{ manychat_id: string | null }>(
        `SELECT manychat_id FROM mentoria.estudiantes_autorizados
         WHERE lower(trim(email)) = $1 LIMIT 1`,
        [estudianteEmail.toLowerCase().trim()]
      );
      const mcId = r[0]?.manychat_id;
      if (mcId) {
        await enviarWhatsApp(mcId, flowNs, {
          se_profesor: cita.profesor.nombre,
          se_fecha: slotLabel(fechaISO, hora, tz),
          se_zoom_url: cita.joinUrl ?? "",
        });
      }
    }
  } catch (e) {
    console.error("[reservar] WhatsApp (ManyChat) falló:", e);
  }

  // Webhook a n8n (best-effort): n8n puede registrar la mentoría en el Google
  // Sheet del profesor asignado con nombre, email, día y hora (Colombia). No
  // bloquea ni revierte la cita si falla. Solo se dispara si N8N_WEBHOOK_CITA
  // está definido.
  try {
    const webhook = process.env.N8N_WEBHOOK_CITA;
    if (webhook) {
      const cuando = slotLabel(fechaISO, hora); // Colombia: "lunes 30 jun · 6:30 AM"
      await fetch(webhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.N8N_WEBHOOK_SECRET
            ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET }
            : {}),
        },
        body: JSON.stringify({
          evento: "mentoria_agendada",
          citaId: cita.id,
          profesor: cita.profesor.nombre, // para elegir el sheet del profesor
          profesorId: cita.profesor.id,
          estudianteNombre,
          estudianteEmail,
          fecha: fechaISO, // fecha Colombia (YYYY-MM-DD)
          hora, // hora Colombia (HH:MM)
          cuando, // etiqueta legible Colombia (día + fecha + hora)
          joinUrl: cita.joinUrl ?? "",
        }),
        signal: AbortSignal.timeout(10_000),
      });
    }
  } catch (e) {
    console.error("[reservar] webhook n8n falló (cita ya creada):", e);
  }

  return cita;
}
