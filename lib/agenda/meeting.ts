import { MEETING_PROVIDER } from "./config";

// Datos mínimos para crear una reunión.
export type MeetingInput = {
  profesor: { id: number; nombre: string; zoomAccountId?: string | null; zoomClientId?: string | null; zoomClientSecret?: string | null; zoomUserEmail?: string | null };
  estudianteNombre: string;
  fechaISO: string; // 2026-06-30
  hora: string; // "HH:MM", ej. "15:30"
  durationMin: number;
};

export type Meeting = {
  meetingId: string | null;
  joinUrl: string; // enlace para el estudiante
  startUrl: string | null; // enlace anfitrión (profesor)
};

export interface MeetingProvider {
  crear(input: MeetingInput): Promise<Meeting>;
}

// --- Placeholder: no llama a Zoom; genera un enlace temporal -----------------
// Permite construir y probar todo el flujo antes de tener las apps de Zoom.
class PlaceholderProvider implements MeetingProvider {
  async crear(input: MeetingInput): Promise<Meeting> {
    const ref = `${input.profesor.id}-${input.fechaISO}-${input.hora}`;
    return {
      meetingId: `placeholder-${ref}`,
      joinUrl: `https://example.com/zoom-pendiente/${ref}`,
      startUrl: null,
    };
  }
}

// --- Zoom (Server-to-Server OAuth, una cuenta por profesor) ------------------
// Se activa con MEETING_PROVIDER=zoom y credenciales por profesor en la tabla.
class ZoomProvider implements MeetingProvider {
  private async accessToken(p: MeetingInput["profesor"]): Promise<string> {
    if (!p.zoomAccountId || !p.zoomClientId || !p.zoomClientSecret) {
      throw new Error(`Profesor ${p.nombre} sin credenciales Zoom configuradas`);
    }
    const basic = Buffer.from(`${p.zoomClientId}:${p.zoomClientSecret}`).toString("base64");
    const res = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${p.zoomAccountId}`,
      { method: "POST", headers: { Authorization: `Basic ${basic}` } }
    );
    if (!res.ok) throw new Error(`Zoom OAuth falló: ${res.status} ${await res.text()}`);
    return (await res.json()).access_token as string;
  }

  async crear(input: MeetingInput): Promise<Meeting> {
    const token = await this.accessToken(input.profesor);
    // start_time en hora local; Zoom lo interpreta con el timezone enviado abajo.
    const startTime = `${input.fechaISO}T${input.hora}:00`;
    const userId = input.profesor.zoomUserEmail ?? "me";
    const res = await fetch(`https://api.zoom.us/v2/users/${encodeURIComponent(userId)}/meetings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: `Mentoría 1:1 Speak Easy · ${input.estudianteNombre} con ${input.profesor.nombre}`,
        type: 2, // scheduled
        start_time: startTime,
        duration: input.durationMin,
        timezone: process.env.APP_TZ ?? "America/Bogota",
        settings: { join_before_host: false, waiting_room: true },
      }),
    });
    if (!res.ok) throw new Error(`Zoom create meeting falló: ${res.status} ${await res.text()}`);
    const m = await res.json();
    return { meetingId: String(m.id), joinUrl: m.join_url, startUrl: m.start_url ?? null };
  }
}

export function getMeetingProvider(): MeetingProvider {
  return MEETING_PROVIDER === "zoom" ? new ZoomProvider() : new PlaceholderProvider();
}
