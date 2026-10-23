import nodemailer, { type Transporter } from "nodemailer";

// ─────────────────────────────────────────────────────────────────────────────
// Envío de correo por SMTP (Google Workspace). Sale desde el correo corporativo
// configurado en SMTP_USER / MAIL_FROM. Requiere una "contraseña de aplicación"
// de Google (no la contraseña normal).
// ─────────────────────────────────────────────────────────────────────────────

let cached: Transporter | null = null;

function transporter(): Transporter {
  if (cached) return cached;
  const port = Number(process.env.SMTP_PORT) || 465;
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465, // 465 = SSL · 587 = STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return cached;
}

function smtpConfigurado(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}): Promise<void> {
  if (!smtpConfigurado()) {
    throw new Error("SMTP no configurado (faltan SMTP_HOST/SMTP_USER/SMTP_PASS)");
  }
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  await transporter().sendMail({ from, ...opts });
}

// Escapa texto que viene del usuario antes de insertarlo en el HTML del correo.
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Plantilla HTML con la identidad de Speak Easy.
export function emailLayout(titulo: string, contenidoHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;background:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:linear-gradient(135deg,#ff327d,#b86bc4);border-radius:14px 14px 0 0;padding:26px;text-align:center;">
      <h1 style="color:#ffffff;margin:0;font-size:22px;letter-spacing:0.3px;">Speak Easy</h1>
    </div>
    <div style="background:#ffffff;border-radius:0 0 14px 14px;padding:30px;color:#333333;line-height:1.65;font-size:15px;">
      <h2 style="margin:0 0 16px;color:#b8367a;font-size:19px;">${titulo}</h2>
      ${contenidoHtml}
    </div>
    <p style="text-align:center;color:#999999;font-size:12px;margin-top:18px;">Speak Easy · Házlo fácil con Speak Easy</p>
  </div>
</body></html>`;
}
