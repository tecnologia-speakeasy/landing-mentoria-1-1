"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Slot = { fechaISO: string; hora: string; cupos: number; disponible: boolean };
type Cita = {
  id: number;
  fechaISO: string;
  hora: string;
  joinUrl: string | null;
  profesor: { id: number; nombre: string; fotoUrl: string | null };
};

const TOPBAR_BG = "linear-gradient(90deg, #41276B 0%, #613BA0 55%, #E9407E 100%)";
const PAGE_BG = "#ffffff url('/FONDO.png') center center / cover no-repeat fixed";
const PANEL_BG =
  "radial-gradient(ellipse at 50% 108%, rgba(190,70,210,0.4) 0%, rgba(190,70,210,0) 60%)," +
  "linear-gradient(160deg, #4a2c7d 0%, #38205f 100%)";

// La hora del slot ("HH:MM") está definida en Colombia (UTC-5, sin horario de verano).
function instanteSlot(fechaISO: string, hora: string): Date {
  return new Date(`${fechaISO}T${hora}:00-05:00`);
}
function horaLocal(fechaISO: string, hora: string) {
  return instanteSlot(fechaISO, hora).toLocaleTimeString("es-CO", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}
function fechaLocalLarga(fechaISO: string, hora: string) {
  return instanteSlot(fechaISO, hora).toLocaleDateString("es-CO", {
    weekday: "long", day: "numeric", month: "long",
  });
}
// Fecha LOCAL del estudiante ("YYYY-MM-DD") en que cae el slot. Se usa para
// agrupar los días según la zona horaria del navegador (no la de Colombia).
function fechaLocalKey(fechaISO: string, hora: string) {
  return instanteSlot(fechaISO, hora).toLocaleDateString("en-CA"); // YYYY-MM-DD
}
// Noche = desde las 6:00 pm en la hora local del estudiante.
function esNoche(s: Slot) {
  return instanteSlot(s.fechaISO, s.hora).getHours() >= 18;
}
function iniciales(nombre: string) {
  return nombre.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}
function diaSemana(fechaISO: string, formato: "long" | "short") {
  const w = new Date(`${fechaISO}T12:00:00`).toLocaleDateString("es-CO", { weekday: formato });
  return w.charAt(0).toUpperCase() + w.slice(1);
}
function diaNumero(fechaISO: string) {
  return fechaISO.slice(8, 10);
}

type RespuestaSlots =
  | { tipo: "ok"; slots: Slot[]; cita: Cita | null; duracionMin: number }
  | { tipo: "no_auth" }
  | { tipo: "error"; error: string };

// Pide los horarios al backend. No toca el estado de React: el componente
// aplica el resultado (así el efecto inicial solo hace setState en el callback).
async function pedirSlots(): Promise<RespuestaSlots> {
  try {
    const res = await fetch("/api/slots");
    if (res.status === 401) return { tipo: "no_auth" };
    const data = await res.json();
    if (!res.ok) {
      return { tipo: "error", error: data.error ?? "No pudimos cargar los horarios. Intenta de nuevo." };
    }
    return {
      tipo: "ok",
      slots: data.slots ?? [],
      cita: data.cita ?? null,
      duracionMin: data.duracionMin ?? 30,
    };
  } catch {
    return { tipo: "error", error: "Error de conexión. Intenta de nuevo." };
  }
}

function PersonIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#9aa3b2">
      <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2.5c-4.4 0-8 2.2-8 5V21h16v-1.5c0-2.8-3.6-5-8-5Z" />
    </svg>
  );
}

export default function AgendarPage() {
  const router = useRouter();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [cita, setCita] = useState<Cita | null>(null);
  const [duracionMin, setDuracionMin] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reservando, setReservando] = useState(false);
  const [fechaSel, setFechaSel] = useState<string | null>(null);
  const [horaSel, setHoraSel] = useState<string | null>(null);
  // Solo en celular: divide los horarios en Día (6:00am–5:59pm) / Noche (6:00pm+).
  // null = automático (Noche si el día elegido solo tiene horarios de noche).
  const [franjaSel, setFranjaSel] = useState<"dia" | "noche" | null>(null);

  const tz = useMemo(
    () =>
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : "America/Bogota",
    []
  );

  const aplicarSlots = useCallback(
    (r: RespuestaSlots) => {
      if (r.tipo === "no_auth") {
        router.push("/");
        return;
      }
      if (r.tipo === "error") {
        setError(r.error);
      } else {
        setSlots(r.slots);
        setCita(r.cita);
        setDuracionMin(r.duracionMin);
      }
      setLoading(false);
    },
    [router]
  );

  useEffect(() => {
    let cancelado = false;
    pedirSlots().then((r) => {
      if (!cancelado) aplicarSlots(r);
    });
    return () => {
      cancelado = true;
    };
  }, [aplicarSlots]);

  // Días = fechas LOCALES del estudiante (un slot puede caer en otro día según su tz).
  const dias = useMemo(() => {
    const set = new Set(slots.map((s) => fechaLocalKey(s.fechaISO, s.hora)));
    return [...set].sort();
  }, [slots]);

  // Si el estudiante aún no eligió día, se usa el primer día local con cupo.
  const primerDiaDisponible = useMemo(
    () =>
      [
        ...new Set(
          slots.filter((s) => s.disponible).map((s) => fechaLocalKey(s.fechaISO, s.hora))
        ),
      ].sort()[0] ?? null,
    [slots]
  );
  const fechaActiva = fechaSel ?? primerDiaDisponible;

  // Horarios del día local seleccionado, ordenados por instante real.
  const horasDelDia = useMemo(
    () =>
      fechaActiva
        ? slots
            .filter((s) => fechaLocalKey(s.fechaISO, s.hora) === fechaActiva)
            .sort(
              (a, b) =>
                instanteSlot(a.fechaISO, a.hora).getTime() -
                instanteSlot(b.fechaISO, b.hora).getTime()
            )
        : [],
    [slots, fechaActiva]
  );
  const franja =
    franjaSel ??
    (horasDelDia.length > 0 && horasDelDia.every((s) => esNoche(s)) ? "noche" : "dia");

  function seleccionarDia(iso: string) {
    setFechaSel(iso);
    setHoraSel(null);
    setFranjaSel(null);
    setError(null);
  }

  async function finalizar() {
    if (!fechaActiva || !horaSel) return;
    // horaSel = "fechaISO|hora" (de Colombia) -> lo que necesita el backend.
    const [fechaISO, hora] = horaSel.split("|");
    setError(null);
    setReservando(true);
    try {
      const res = await fetch("/api/reservar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechaISO, hora, tz }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo agendar.");
        setHoraSel(null);
        aplicarSlots(await pedirSlots());
        return;
      }
      setCita(data.cita);
    } catch {
      setError("Error de conexión. Intenta de nuevo.");
    } finally {
      setReservando(false);
    }
  }

  // "Salir": vuelve al menú SIN cerrar la sesión.
  function volverInicio() {
    router.push("/");
  }
  // "Cerrar sesión": limpia la cookie y vuelve al login.
  async function cerrarSesion() {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {}
    router.push("/");
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: PAGE_BG }}>
      {/* Barra superior */}
      <header
        className="flex items-center justify-between px-7 py-3"
        style={{ background: TOPBAR_BG }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo_blanco.png" alt="Speak Easy" style={{ height: 42 }} />
        <div className="flex items-center gap-3.5">
          <button
            onClick={cerrarSesion}
            className="rounded-lg border border-white/30 bg-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/25"
          >
            Cerrar sesión
          </button>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white">
            <PersonIcon />
          </span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center p-7 sm:p-8">
        {loading ? (
          <p className="text-slate-500">Cargando…</p>
        ) : cita ? (
          /* --- Confirmación de la mentoría --- */
          <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              ✓ Mentoría confirmada
            </div>
            <div className="mt-5 flex flex-col items-center">
              {cita.profesor.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cita.profesor.fotoUrl}
                  alt={cita.profesor.nombre}
                  className="h-24 w-24 rounded-full object-cover ring-2 ring-slate-200"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-200 text-2xl font-semibold text-slate-600">
                  {iniciales(cita.profesor.nombre)}
                </div>
              )}
              <p className="mt-3 text-xs uppercase tracking-wide text-slate-400">Tu profesor</p>
              <p className="text-lg font-semibold">{cita.profesor.nombre}</p>
            </div>
            <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm">
              <p className="font-medium capitalize">{fechaLocalLarga(cita.fechaISO, cita.hora)}</p>
              <p className="text-slate-600">{horaLocal(cita.fechaISO, cita.hora)}</p>
            </div>
            <button
              onClick={volverInicio}
              className="mt-6 block w-full cursor-pointer rounded-xl px-4 py-3 text-sm font-bold text-white transition hover:opacity-95"
              style={{ background: "linear-gradient(90deg, #FF327D 0%, #6D2EBF 100%)" }}
            >
              Cerrar
            </button>
            <p className="mt-3 text-xs text-slate-400">
              Te enviamos a tu correo la confirmación con el enlace de la sesión.
              Solo puedes agendar una mentoría.
            </p>
          </div>
        ) : (
          /* --- Reserva --- */
          <div className="grid w-full max-w-3xl gap-5 md:grid-cols-2 md:gap-0 md:overflow-hidden md:rounded-3xl md:bg-white md:shadow-2xl">
            {/* Panel izquierdo morado (en móvil: tarjeta redondeada independiente) */}
            <div
              className="relative flex flex-col rounded-3xl p-7 text-white shadow-xl md:min-h-[480px] md:rounded-none md:shadow-none"
              style={{ background: PANEL_BG }}
            >
              <button
                onClick={volverInicio}
                className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white hover:bg-white/25"
              >
                ← Salir
              </button>
              <h1 className="mt-7 text-3xl font-extrabold">Agenda tu mentoría</h1>
              <p className="mt-3 text-sm leading-relaxed text-white/85">
                Elige el día y la hora de tu sesión 1:1 y conversa con uno de
                nuestros profesores
              </p>
              <p className="mt-4 flex items-center gap-2 text-sm text-white/90">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                {duracionMin} minutos
              </p>
              {/* La imagen solo se muestra en desktop (md+); en celular se oculta */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/agendamiento.png"
                alt=""
                className="pointer-events-none absolute inset-x-0 bottom-0 hidden w-full md:block"
              />
            </div>

            {/* Panel derecho (en móvil: sin fondo, transparente sobre el FONDO) */}
            <div className="flex flex-col p-0 md:p-7">
              <h2 className="text-xl font-bold text-slate-800">Selecciona fecha y hora</h2>

              {error && (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {error}
                </p>
              )}

              {dias.length === 0 ? (
                /* Sin profesores/disponibilidad cargados o ventana sin horarios */
                !error && (
                  <div className="mt-5 rounded-2xl p-6 text-center" style={{ background: "#f1ecfb" }}>
                    <p className="font-bold text-slate-700">Aún no hay horarios disponibles</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Estamos organizando la agenda de nuestros profesores. Vuelve pronto.
                    </p>
                  </div>
                )
              ) : (
                <>
              {/* Selector de días + horarios conectados (efecto pestaña) */}
              <style>{`
                .dia-neck {
                  position: absolute;
                  left: 0; right: 0;
                  top: 44px;
                  height: 32px;
                  background: #f1ecfb;
                  z-index: 10;
                }
                .dia-neck::before, .dia-neck::after {
                  content: "";
                  position: absolute;
                  bottom: 0;
                  width: 12px; height: 12px;
                  background: transparent;
                }
                .dia-neck::before {
                  left: -12px;
                  border-bottom-right-radius: 12px;
                  box-shadow: 6px 6px 0 6px #f1ecfb;
                }
                .dia-neck::after {
                  right: -12px;
                  border-bottom-left-radius: 12px;
                  box-shadow: -6px 6px 0 6px #f1ecfb;
                }
                /* En los extremos, ocultar el flare que se saldría del panel */
                .dia-neck--first::before { display: none; }
                .dia-neck--last::after { display: none; }
                /* Solo en celular: filtra horarios por franja (Día/Noche) */
                @media (max-width: 767px) {
                  .franja-dia .slot-noche { display: none; }
                  .franja-noche .slot-dia { display: none; }
                }
                /* Scrollbar de horarios: delgada, redondeada y con el morado del tema */
                .horarios-scroll { scrollbar-width: thin; scrollbar-color: #b9a3e8 transparent; }
                .horarios-scroll::-webkit-scrollbar { width: 6px; }
                .horarios-scroll::-webkit-scrollbar-track { background: transparent; margin: 4px 0; }
                .horarios-scroll::-webkit-scrollbar-thumb {
                  background: #b9a3e8;
                  border-radius: 999px;
                }
                .horarios-scroll::-webkit-scrollbar-thumb:hover { background: #8a5cf6; }
              `}</style>
              <div className="relative mt-5">
                <div className="relative z-10 flex gap-2.5">
                  {dias.map((iso, i) => {
                    const sel = fechaActiva === iso;
                    const neckClase =
                      "dia-neck" +
                      (i === 0 ? " dia-neck--first" : "") +
                      (i === dias.length - 1 ? " dia-neck--last" : "");
                    return (
                      <div key={iso} className="flex flex-1 flex-col items-center gap-1.5">
                        <span className="text-[11px] text-slate-500">
                          {diaSemana(iso, dias.length > 5 ? "short" : "long")}
                        </span>
                        <div className="relative w-full">
                          <button
                            onClick={() => seleccionarDia(iso)}
                            aria-pressed={sel}
                            className="relative z-20 h-14 w-full cursor-pointer rounded-xl text-2xl font-bold text-white transition"
                            style={{
                              background: "#FF327D",
                              boxShadow: sel ? "0 6px 16px rgba(255,50,125,0.4)" : "none",
                              opacity: sel ? 1 : 0.88,
                            }}
                          >
                            {diaNumero(iso)}
                          </button>
                          {sel && <span className={neckClase} />}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Horarios */}
                <div className="relative z-0 mt-4 rounded-b-2xl p-5" style={{ background: "#f1ecfb" }}>
                  <p className="mb-3 font-bold text-slate-700">Horarios</p>

                  {/* Toggle Día / Noche — solo en celular */}
                  <div className="mb-3 flex gap-2 md:hidden">
                    {(["dia", "noche"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setFranjaSel(f)}
                        aria-pressed={franja === f}
                        className="flex-1 cursor-pointer rounded-lg py-2 text-sm font-semibold transition"
                        style={
                          franja === f
                            ? { background: "#3a2a5e", color: "#ffffff" }
                            : { background: "#ddd6ea", color: "#8a86a0" }
                        }
                      >
                        {f === "dia" ? "Día" : "Noche"}
                      </button>
                    ))}
                  </div>

                  <div
                    className={
                      "horarios-scroll flex max-h-none flex-col gap-2.5 overflow-y-auto pr-2 md:max-h-44 " +
                      (franja === "dia" ? "franja-dia" : "franja-noche")
                    }
                  >
                  {horasDelDia.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400">Selecciona un día.</p>
                  ) : (
                    horasDelDia.map((s) => {
                      const slotKey = `${s.fechaISO}|${s.hora}`;
                      const sel = horaSel === slotKey;
                      return (
                        <button
                          key={slotKey}
                          disabled={!s.disponible}
                          onClick={() => setHoraSel(slotKey)}
                          aria-pressed={sel}
                          className={
                            "cursor-pointer rounded-xl border py-2.5 text-center text-sm font-medium transition disabled:cursor-not-allowed disabled:text-slate-300 disabled:line-through " +
                            (esNoche(s) ? "slot-noche" : "slot-dia")
                          }
                          style={{
                            background: sel ? "#8a5cf6" : "transparent",
                            borderColor: "#8a5cf6",
                            color: s.disponible ? (sel ? "#ffffff" : "#6D2EBF") : undefined,
                          }}
                        >
                          {horaLocal(s.fechaISO, s.hora)}
                        </button>
                      );
                    })
                  )}
                  </div>
                </div>
              </div>

              <button
                onClick={finalizar}
                disabled={!fechaActiva || horaSel === null || reservando}
                className="mt-5 w-full rounded-xl py-3 text-sm font-bold text-white transition disabled:opacity-50"
                style={{ background: "#FF327D" }}
              >
                {reservando ? "Agendando…" : "Finalizar agendamiento"}
              </button>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
