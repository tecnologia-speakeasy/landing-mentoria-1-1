// ─────────────────────────────────────────────────────────────────────────────
// Envío de WhatsApp por ManyChat (plantillas Utility aprobadas por Meta).
// Patrón: fijar custom fields del contacto → disparar el flow que los usa.
// El subscriber_id es el manychat_id guardado en mentoria.estudiantes_autorizados.
// ─────────────────────────────────────────────────────────────────────────────

const MANYCHAT_API = "https://api.manychat.com";

export function manychatConfigurado(): boolean {
  return Boolean(process.env.MANYCHAT_API_TOKEN);
}

async function mc(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${MANYCHAT_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MANYCHAT_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`ManyChat ${path}: ${res.status} ${(await res.text()).slice(0, 250)}`);
  }
}

// Fija un custom field del contacto por su nombre. El valor puede ser texto o
// número (ManyChat valida el tipo según cómo se creó el campo).
async function setField(
  subscriberId: number,
  fieldName: string,
  fieldValue: string | number
): Promise<void> {
  await mc("/fb/subscriber/setCustomFieldByName", {
    subscriber_id: subscriberId,
    field_name: fieldName,
    field_value: fieldValue,
  });
}

// Fija los custom fields indicados y dispara el flow (envía la plantilla).
export async function enviarWhatsApp(
  manychatId: string,
  flowNs: string,
  fields: Record<string, string | number>
): Promise<void> {
  if (!manychatConfigurado()) throw new Error("ManyChat no configurado");
  const subscriberId = Number(manychatId);
  if (!Number.isFinite(subscriberId)) throw new Error(`manychat_id inválido: ${manychatId}`);

  for (const [name, value] of Object.entries(fields)) {
    await setField(subscriberId, name, value);
  }
  await mc("/fb/sending/sendFlow", { subscriber_id: subscriberId, flow_ns: flowNs });
}
