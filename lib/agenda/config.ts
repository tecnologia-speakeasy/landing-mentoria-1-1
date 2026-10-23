// Configuración del negocio leída del entorno. Centraliza la ventana de
// agendamiento. La disponibilidad real por profesor vive en la tabla
// mentoria.disponibilidad (día de semana + franja).

export const APP_TZ = process.env.APP_TZ ?? "America/Bogota";

// Duración de cada mentoría y separación entre slots (son la misma: un slot =
// una sesión). Por defecto 30 min. Si cambia, hay que volver a correr el seed
// para que la disponibilidad quede en la nueva rejilla.
export const SLOT_DURATION_MIN = parseInt(process.env.BOOKING_SLOT_STEP_MIN ?? "30", 10);

// Ventana de días que se ofrecen para agendar:
//  - Si BOOKING_DATES tiene fechas (YYYY-MM-DD separadas por coma), se usan esas.
//  - Si no, ventana móvil de BOOKING_DAYS_AHEAD días desde hoy (Colombia).
// Los días sin profesores disponibles no se muestran.
const BOOKING_DAYS_AHEAD = parseInt(process.env.BOOKING_DAYS_AHEAD ?? "7", 10);

export function bookingDates(ahora: number = Date.now()): string[] {
  const fijas = (process.env.BOOKING_DATES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fijas.length) return fijas;

  const out: string[] = [];
  for (let i = 0; i < BOOKING_DAYS_AHEAD; i++) {
    out.push(new Date(ahora + i * 86_400_000).toLocaleDateString("en-CA", { timeZone: APP_TZ }));
  }
  return out;
}

// Rejilla de horarios (HH:MM) generada del rango configurable. Por defecto
// 06:00–22:00 cada SLOT_DURATION_MIN (último slot incluido = 22:00).
const toMin = (s: string) => {
  const [h, m] = s.split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
};
const fmt = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

function generarSlots(start: string, end: string, stepMin: number): string[] {
  const out: string[] = [];
  for (let m = toMin(start); m <= toMin(end); m += stepMin) out.push(fmt(m));
  return out;
}

export const BOOKING_SLOTS = generarSlots(
  process.env.BOOKING_SLOT_START ?? "06:00",
  process.env.BOOKING_SLOT_END ?? "22:00",
  SLOT_DURATION_MIN
);

export const NOTIFIER = (process.env.NOTIFIER ?? "log") as
  | "log"
  | "email"
  | "whatsapp";

export const MEETING_PROVIDER = (process.env.MEETING_PROVIDER ??
  "placeholder") as "placeholder" | "zoom";

// Instante real de un slot. La hora está definida en Colombia (UTC-5, sin
// horario de verano), así que anclamos el offset -05:00.
export function instanteSlot(fechaISO: string, hora: string): Date {
  return new Date(`${fechaISO}T${hora}:00-05:00`);
}

// Antelación mínima para agendar: un slot solo es reservable si su inicio está
// al menos estos minutos en el futuro (por defecto 2 horas). Esto deshabilita
// los horarios ya pasados y los que faltan menos de 2h respecto a la hora actual.
export const BOOKING_LEAD_MIN = parseInt(process.env.BOOKING_LEAD_MIN ?? "120", 10);

// ¿El slot está suficientemente en el futuro para poder agendarlo?
// Ej. si son las 8:00, con lead de 120 min el primer slot reservable es 10:00.
export function slotReservable(
  fechaISO: string,
  hora: string,
  ahora: number = Date.now()
): boolean {
  return instanteSlot(fechaISO, hora).getTime() >= ahora + BOOKING_LEAD_MIN * 60_000;
}

// Etiqueta legible de un slot en la zona horaria indicada (por defecto Colombia).
// Ej. para un estudiante en EE.UU.: "lunes 30 jun · 3:30 PM" (su hora local).
export function slotLabel(fechaISO: string, hora: string, tz: string = APP_TZ): string {
  const instante = instanteSlot(fechaISO, hora);
  const dia = instante.toLocaleDateString("es-CO", { weekday: "long", timeZone: tz });
  const fecha = instante.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    timeZone: tz,
  });
  const hm = instante.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
  return `${dia} ${fecha} · ${hm}`;
}

// ISO DOW (1=Lunes ... 7=Domingo) de una fecha YYYY-MM-DD.
// Se parsea a mediodía local para evitar bordes de zona horaria.
export function isoDow(fechaISO: string): number {
  const local = new Date(`${fechaISO}T12:00:00`);
  return ((local.getDay() + 6) % 7) + 1; // 0=Dom -> 7 ; 1=Lun -> 1
}
