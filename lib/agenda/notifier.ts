import { NOTIFIER, slotLabel } from "./config";
import { sendMail, emailLayout, escapeHtml } from "@/lib/email";

export type ConfirmacionInput = {
  estudianteNombre: string;
  estudianteEmail: string;
  profesorNombre: string;
  fechaISO: string;
  hora: string; // "HH:MM"
  joinUrl: string;
  tz?: string; // zona horaria del estudiante (para mostrar su hora local)
};

export interface Notifier {
  enviarConfirmacion(input: ConfirmacionInput): Promise<void>;
}

function plantillaTexto(i: ConfirmacionInput): { asunto: string; cuerpo: string } {
  const cuando = slotLabel(i.fechaISO, i.hora, i.tz);
  return {
    asunto: `Tu mentoría 1:1 Speak Easy quedó agendada · ${cuando}`,
    cuerpo:
      `Hola ${i.estudianteNombre},\n\n` +
      `Tu mentoría 1:1 quedó confirmada para el ${cuando}.\n` +
      `Profesor asignado: ${i.profesorNombre}.\n` +
      `Enlace de Zoom: ${i.joinUrl}\n\n` +
      `¡Nos vemos!`,
  };
}

// --- Log: imprime en consola (por defecto, sin proveedor configurado) --------
class LogNotifier implements Notifier {
  async enviarConfirmacion(i: ConfirmacionInput): Promise<void> {
    const { asunto, cuerpo } = plantillaTexto(i);
    console.log(`\n[NOTIFIER:log] -> ${i.estudianteEmail}\nASUNTO: ${asunto}\n${cuerpo}\n`);
  }
}

// --- Email (SMTP del correo corporativo, vía lib/email) ----------------------
class EmailNotifier implements Notifier {
  async enviarConfirmacion(i: ConfirmacionInput): Promise<void> {
    const cuando = slotLabel(i.fechaISO, i.hora, i.tz);
    const { asunto, cuerpo } = plantillaTexto(i);
    const html = emailLayout(
      "¡Tu mentoría quedó agendada!",
      `<p>Hola <strong>${escapeHtml(i.estudianteNombre)}</strong>,</p>
       <p>Tu mentoría 1:1 quedó confirmada para:</p>
       <p style="font-size:16px;"><strong>${cuando}</strong></p>
       <p>Profesor asignado: <strong>${escapeHtml(i.profesorNombre)}</strong></p>
       <p style="margin:24px 0;">
         <a href="${i.joinUrl}" style="background:linear-gradient(135deg,#ff327d,#b86bc4);color:#fff;text-decoration:none;padding:13px 26px;border-radius:10px;display:inline-block;font-weight:bold;">Unirme por Zoom</a>
       </p>
       <p style="color:#666;font-size:13px;">O copia este enlace: ${i.joinUrl}</p>
       <p>¡Nos vemos!</p>`
    );
    await sendMail({ to: i.estudianteEmail, subject: asunto, html, text: cuerpo });
  }
}

// --- WhatsApp (placeholder: Twilio / WhatsApp Cloud API) ---------------------
class WhatsAppNotifier implements Notifier {
  async enviarConfirmacion(i: ConfirmacionInput): Promise<void> {
    // TODO: integrar Twilio / WhatsApp Cloud API con plantilla aprobada.
    console.warn(`[NOTIFIER:whatsapp] pendiente de integrar proveedor para ${i.estudianteEmail}`);
  }
}

export function getNotifier(): Notifier {
  switch (NOTIFIER) {
    case "email":
      return new EmailNotifier();
    case "whatsapp":
      return new WhatsAppNotifier();
    default:
      return new LogNotifier();
  }
}
