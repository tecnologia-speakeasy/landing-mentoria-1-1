import { NextResponse } from "next/server";
import { getSession } from "@/lib/agenda/auth";
import { listarSlots, citaDeEstudiante } from "@/lib/agenda/booking";
import { SLOT_DURATION_MIN } from "@/lib/agenda/config";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  try {
    const [slots, cita] = await Promise.all([
      listarSlots(),
      citaDeEstudiante(session.estudianteId),
    ]);
    return NextResponse.json({ slots, cita, duracionMin: SLOT_DURATION_MIN });
  } catch (err) {
    console.error("[/api/slots] Error:", err);
    return NextResponse.json(
      { error: "No pudimos cargar los horarios. Intenta de nuevo." },
      { status: 503 }
    );
  }
}
