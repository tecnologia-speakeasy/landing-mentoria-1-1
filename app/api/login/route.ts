import { NextResponse } from "next/server";
import { z } from "zod";
import { query } from "@/lib/agenda/db";
import { setSession } from "@/lib/agenda/auth";
import { citaDeEstudiante } from "@/lib/agenda/booking";

const schema = z.object({
  nombre: z.string().trim().min(2, "Ingresa tu nombre").max(120),
  email: z.string().trim().toLowerCase().email("Correo inválido"),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    );
  }
  const { nombre, email } = parsed.data;

  try {
    // Autorización: el correo debe existir en mentoria.estudiantes_autorizados.
    // Normalizamos ambos lados (trim + lower) porque puede haber correos
    // cargados con mayúsculas o espacios sobrantes.
    const autorizado = await query<{ id: number }>(
      `SELECT id FROM mentoria.estudiantes_autorizados WHERE lower(trim(email)) = $1 LIMIT 1`,
      [email]
    );
    if (autorizado.length === 0) {
      return NextResponse.json(
        {
          error:
            "Este correo no está autorizado para agendar mentoría. Verifica que sea el correo con el que te registraste.",
        },
        { status: 403 }
      );
    }

    // Upsert del estudiante (guarda el nombre capturado; actualiza si reingresa).
    const est = await query<{ id: number }>(
      `INSERT INTO mentoria.estudiantes (email, nombre)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING id`,
      [email, nombre]
    );
    const estudianteId = est[0].id;

    await setSession({ estudianteId, email, nombre });

    // Si ya tiene mentoría activa, lo informamos para que la UI lo sepa.
    const cita = await citaDeEstudiante(estudianteId);
    return NextResponse.json({ ok: true, yaAgendo: !!cita });
  } catch (err) {
    console.error("[/api/login] Error:", err);
    // 503 para que el front lo distinga de "no autorizado" y muestre "intenta de nuevo".
    return NextResponse.json(
      { error: "No pudimos validar tu correo en este momento. Intenta de nuevo." },
      { status: 503 }
    );
  }
}
