import crypto from "crypto";
import { cookies } from "next/headers";

// Nombre propio para no chocar con la cookie del sistema de evaluación
// (en localhost ambos proyectos comparten cookies).
const COOKIE = "mentoria_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 días

export type Session = {
  estudianteId: number;
  email: string;
  nombre: string;
};

// En producción el secreto es obligatorio: con el valor por defecto cualquiera
// podría firmar una sesión válida.
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Falta la variable de entorno SESSION_SECRET");
  }
  return "dev-secret-cambia-esto";
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function serialize(s: Session): string {
  const body = Buffer.from(JSON.stringify(s)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function deserialize(token: string): Session | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  // Comparación en tiempo constante.
  const expected = sign(body);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as Session;
  } catch {
    return null;
  }
}

export async function setSession(s: Session): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, serialize(s), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  return token ? deserialize(token) : null;
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}
