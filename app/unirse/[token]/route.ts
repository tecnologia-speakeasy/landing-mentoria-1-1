import { NextResponse } from "next/server";
import { query } from "@/lib/agenda/db";

// Enlace corto para unirse a la mentoría: /unirse/<token> redirige al Zoom de
// la cita. Lo usa el botón "Unirse" de la plantilla de WhatsApp, cuya URL es
// fija en Meta y solo admite una variable al final (el token).
export async function GET(_req: Request, ctx: RouteContext<"/unirse/[token]">) {
  const { token } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) {
    return pagina("Este enlace no es válido.", 404);
  }
  try {
    const rows = await query<{ join_url: string | null }>(
      `SELECT zoom_join_url AS join_url FROM mentoria.citas
       WHERE token = $1 AND estado = 'confirmada'
       LIMIT 1`,
      [token]
    );
    const url = rows[0]?.join_url;
    if (url && /^https?:\/\//.test(url)) {
      return NextResponse.redirect(url, 302);
    }
    return pagina("Esta mentoría no existe o fue cancelada.", 404);
  } catch (err) {
    console.error("[/unirse] Error:", err);
    return pagina("No pudimos abrir tu mentoría en este momento. Intenta de nuevo en unos minutos.", 503);
  }
}

// Página mínima con la identidad de Speak Easy para los casos sin redirección.
function pagina(mensaje: string, status: number) {
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mentoría 1:1 · Speak Easy</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#41276B;font-family:Arial,Helvetica,sans-serif;padding:24px;box-sizing:border-box;">
  <div style="max-width:420px;width:100%;background:#ffffff;border-radius:20px;padding:32px;text-align:center;color:#333333;">
    <h1 style="margin:0 0 12px;font-size:20px;color:#41276B;">Mentoría 1:1</h1>
    <p style="margin:0 0 24px;line-height:1.5;">${mensaje}</p>
    <a href="/" style="display:inline-block;background:#FF327D;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:10px;">Ir a la página de mentorías</a>
  </div>
</body></html>`;
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
