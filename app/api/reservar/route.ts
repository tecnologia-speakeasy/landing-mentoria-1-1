import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/agenda/auth";
import { reservar, BookingError } from "@/lib/agenda/booking";

const schema = z.object({
  fechaISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida"),
  hora: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida"),
  tz: z.string().optional(), // zona horaria del navegador (para mostrar hora local)
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    );
  }

  try {
    const cita = await reservar({
      estudianteId: session.estudianteId,
      estudianteNombre: session.nombre,
      estudianteEmail: session.email,
      fechaISO: parsed.data.fechaISO,
      hora: parsed.data.hora,
      tz: parsed.data.tz,
    });
    return NextResponse.json({ ok: true, cita });
  } catch (e) {
    if (e instanceof BookingError) {
      // 409 conflicto para slot lleno / ya agendó; 400 para slot inválido.
      const status = e.code === "slot_invalido" ? 400 : 409;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error("[reservar] error inesperado:", e);
    return NextResponse.json(
      { error: "Ocurrió un error al agendar. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
