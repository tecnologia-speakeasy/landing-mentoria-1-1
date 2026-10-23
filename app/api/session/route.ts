import { NextResponse } from "next/server";
import { getSession } from "@/lib/agenda/auth";

// Devuelve la sesión actual (de la cookie firmada) si existe. La usa la pantalla
// de inicio para, si el estudiante ya inició sesión (p.ej. volvió de /agendar),
// mostrarle el menú directamente en vez de pedir login de nuevo.
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ authenticated: false });
  return NextResponse.json({
    authenticated: true,
    nombre: s.nombre,
    email: s.email,
  });
}
