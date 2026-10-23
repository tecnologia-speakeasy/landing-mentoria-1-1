"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

// Pantalla de inicio: login (nombre + correo autorizado) y, ya con sesión, el
// menú con el botón "Agenda tu mentoría" que lleva a /agendar.
export default function Inicio() {
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [validating, setValidating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Al cargar: si ya hay sesión activa (p.ej. el estudiante volvió de /agendar),
  // saltar el login y mostrar el menú directamente.
  useEffect(() => {
    let cancelado = false;
    fetch("/api/session")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelado && d?.authenticated) {
          setStudentName(d.nombre || "");
          setStudentEmail(d.email || "");
          setNameSubmitted(true);
        }
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);

  const reset = () => {
    setStudentName(""); setStudentEmail(""); setEmailTouched(false);
    setNameSubmitted(false); setAuthError(null);
  };

  // Cierra sesión: limpia la cookie de sesión y vuelve al login.
  const cerrarSesion = async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {}
    reset();
  };

  // ── Login ──
  const emailValid = isValidEmail(studentEmail);
  const showEmailError = emailTouched && studentEmail.trim() !== "" && !emailValid;
  const canStart = studentName.trim() !== "" && emailValid;

  // Valida el correo contra la lista de autorizados y crea la sesión.
  const tryStart = async () => {
    if (!emailValid) {
      setEmailTouched(true);
      return;
    }
    if (!canStart || validating) return;

    setValidating(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: studentName.trim(), email: studentEmail.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setNameSubmitted(true);
      } else {
        setAuthError(
          data?.error || "No pudimos validar tu correo en este momento. Intenta de nuevo."
        );
      }
    } catch {
      setAuthError(
        "No pudimos validar tu correo en este momento. Revisa tu conexión e intenta de nuevo."
      );
    } finally {
      setValidating(false);
    }
  };

  if (!nameSubmitted) {
    return (
      <div style={styles.loginPage}>
        <div style={styles.loginBg} />
        <Particles />
        <form
          style={styles.loginCard}
          onSubmit={(e) => {
            e.preventDefault();
            tryStart();
          }}
        >
          <p style={styles.loginWelcome}>¡Bienvenidos!</p>
          <h1 style={styles.loginTitle}>Mentoría 1:1</h1>
          <p style={styles.loginSubtitle}>Ingresa tus datos para agendar tu mentoría</p>

          <label htmlFor="nombre" style={styles.loginLabel}>Nombre</label>
          <input
            id="nombre"
            className="login-input"
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            placeholder="Ej. María García López"
            autoComplete="name"
            style={styles.loginInput}
          />

          <label htmlFor="email" style={styles.loginLabel}>Correo electrónico</label>
          <input
            id="email"
            className="login-input"
            value={studentEmail}
            onChange={(e) => {
              setStudentEmail(e.target.value);
              setAuthError(null);
            }}
            onBlur={() => setEmailTouched(true)}
            placeholder="Ej. maria.garcia@email.com"
            type="email"
            autoComplete="email"
            style={styles.loginInput}
          />

          {showEmailError && (
            <p style={styles.loginError}>
              {studentEmail.includes("@")
                ? "Ingresa un correo electrónico válido (ej. nombre@dominio.com)."
                : "El correo debe contener una arroba (@)."}
            </p>
          )}
          {authError && <p style={styles.loginError} role="alert">{authError}</p>}

          <button
            type="submit"
            disabled={!canStart || validating}
            style={{
              ...styles.loginBtn,
              opacity: canStart && !validating ? 1 : 0.9,
              cursor: canStart && !validating ? "pointer" : "not-allowed",
            }}
          >
            {validating ? "Ingresando…" : "Ingresar"}
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo_login.png" alt="Speak Easy" style={styles.loginLogo} />
        </form>

        <style>{`
          .login-input::placeholder { color: #9a9aa8; }
          .login-input:focus { border-color: #c84df0 !important; }
          @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
          @keyframes particleDrift {
            0%{transform:translateY(0) translateX(0);opacity:0}
            10%{opacity:0.95}
            50%{transform:translateY(-50vh) translateX(10px);opacity:0.85}
            90%{opacity:0.5}
            100%{transform:translateY(-100vh) translateX(20px);opacity:0}
          }
        `}</style>
      </div>
    );
  }

  // ── Menú (después del login): única opción, agendar la mentoría ──
  const primerNombre = studentName.trim().split(/\s+/)[0] || "";
  return (
    <div style={styles.hubPage}>
      <header style={styles.hubTopbar}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo_blanco.png" alt="Speak Easy" style={styles.hubLogo} />
        <div style={styles.hubTopbarRight}>
          <button onClick={cerrarSesion} style={styles.hubLogout}>
            Cerrar sesión
          </button>
          <span style={styles.hubAvatar}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#9aa3b2" }}>
              {primerNombre.charAt(0).toUpperCase()}
            </span>
          </span>
        </div>
      </header>

      <main style={styles.hubMain}>
        <h1 style={styles.hubTitle}>¡Hola, {primerNombre}!</h1>
        <p style={styles.hubSubtitle}>Reserva tu sesión 1:1 con uno de nuestros profesores</p>
        <AgendaMentoriaButton />
      </main>
    </div>
  );
}

// ─── Botón "Agenda tu mentoría" ──────────────────────────────────────────────
// Replica el diseño de los botones-imagen del sistema de evaluación
// (Felipe_agenda.png) pero con el texto en HTML. Todo escala con el ancho del
// botón (unidades cqw). Si el diseñador entrega una imagen final, basta con
// reemplazar el contenido del <Link> por un <img>.
function AgendaMentoriaButton() {
  return (
    <>
      <Link href="/agendar" className="mentoria-btn">
        <span className="mentoria-btn__card" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/felipe_mentoria.webp" alt="" className="mentoria-btn__felipe" />
        <span className="mentoria-btn__panel">
          <span className="mentoria-btn__text">
            Agenda tu
            <br />
            mentoría
          </span>
          <svg
            className="mentoria-btn__chevron"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 4l8 8-8 8" />
          </svg>
        </span>
      </Link>
      <style>{`
        .mentoria-btn {
          position: relative; display: block;
          width: 100%; max-width: 580px; aspect-ratio: 593 / 160;
          container-type: inline-size;
          text-decoration: none; border-radius: 22px;
          transition: transform 0.2s ease;
        }
        .mentoria-btn:hover { transform: scale(1.04); }
        .mentoria-btn:focus-visible { outline: 3px solid #41276B; outline-offset: 4px; }
        /* Tarjeta de fondo: deja libre arriba el espacio de la cabeza de Felipe */
        .mentoria-btn__card {
          position: absolute; left: 0; right: 0; bottom: 0; top: 11.25%;
          border-radius: 3.6cqw;
          background: linear-gradient(180deg, #F0407F 0%, #E02E6E 100%);
        }
        .mentoria-btn__felipe {
          position: absolute; left: 1.5%; bottom: 0; height: 100%; width: auto;
        }
        /* El panel tapa el monitor de la ilustración, como en el diseño original */
        .mentoria-btn__panel {
          position: absolute; top: 11.25%; bottom: 0; right: 0; left: 25.3%;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 4cqw 0 5.6cqw;
          border-radius: 3.6cqw;
          background: linear-gradient(90deg, #FF327D 0%, #EE3A82 100%);
          box-shadow: -6px 0 14px rgba(160, 20, 70, 0.18);
        }
        /* Mínimo 19px en negrita (texto grande) para contraste suficiente sobre el fucsia */
        .mentoria-btn__text {
          color: #fff; font-weight: 700; line-height: 1.15;
          font-size: max(19px, 4.5cqw);
        }
        .mentoria-btn__chevron {
          width: 6cqw; height: 6cqw; flex-shrink: 0;
          color: rgba(150, 20, 70, 0.55);
        }
      `}</style>
    </>
  );
}

// ─── Particles ─────────────────────────────────────────────────────────────
function Particles() {
  const particles = Array.from({ length: 60 }, (_, i) => {
    const size = 2 + (i % 4);
    return {
      left: `${(i * 17 + 7) % 100}%`,
      width: `${size}px`,
      height: `${size}px`,
      delay: `${(i * 0.7) % 12}s`,
      duration: `${9 + (i % 10)}s`,
      blur: i % 5 === 0 ? "1px" : "0",
    };
  });
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {particles.map((p, i) => {
        const palette = i % 4;
        const bg =
          palette === 0 ? "rgba(255,50,125,0.6)"
          : palette === 1 ? "rgba(255,138,185,0.55)"
          : palette === 2 ? "rgba(184,107,196,0.5)"
          : "rgba(255,255,255,0.45)";
        const glow =
          palette === 0 ? "0 0 10px rgba(255,50,125,0.55)"
          : palette === 1 ? "0 0 8px rgba(255,138,185,0.5)"
          : palette === 2 ? "0 0 9px rgba(184,107,196,0.5)"
          : "0 0 6px rgba(255,255,255,0.35)";
        return (
          <div key={i} style={{
            position: "absolute", bottom: -10, left: p.left,
            width: p.width, height: p.height, borderRadius: "50%",
            background: bg,
            boxShadow: glow,
            filter: `blur(${p.blur})`,
            animation: `particleDrift ${p.duration} ${p.delay} infinite linear`,
          }} />
        );
      })}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = {
  // ── Login ──
  loginPage: {
    minHeight: "100vh",
    background: "#41276B",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    position: "relative",
    color: "white",
  },
  loginBg: { position: "fixed", inset: 0, zIndex: 0, background: "#41276B" },
  loginCard: {
    position: "relative",
    zIndex: 1,
    width: "100%",
    maxWidth: 440,
    background: "linear-gradient(150deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 45%, rgba(255,255,255,0.11) 100%)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 26,
    padding: "48px 46px 38px",
    backdropFilter: "blur(6px)",
    display: "flex",
    flexDirection: "column",
    animation: "fadeUp 0.5s ease both",
  },
  loginWelcome: {
    textAlign: "center", fontSize: 15, fontWeight: 400, color: "#ffffff", margin: "0 0 10px",
  },
  loginTitle: {
    textAlign: "center",
    fontSize: "clamp(22px, 6vw, 30px)",
    fontWeight: 800,
    lineHeight: 1.1,
    margin: 0,
    whiteSpace: "nowrap",
    background: "linear-gradient(90deg, #ffffff 0%, #FF327D 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  loginSubtitle: {
    textAlign: "center", fontSize: 14, color: "rgba(255,255,255,0.92)",
    margin: "8px 0 28px", fontWeight: 400,
  },
  loginLabel: {
    fontSize: 14, color: "#ffffff", marginBottom: 8, fontWeight: 400, alignSelf: "flex-start",
  },
  loginInput: {
    width: "100%",
    padding: "13px 16px",
    fontSize: 14,
    background: "#ededed",
    border: "1px solid transparent",
    borderRadius: 11,
    color: "#333",
    marginBottom: 18,
    outline: "none",
  },
  loginError: {
    color: "#ffb3c6", fontSize: 13, margin: "-10px 0 14px", lineHeight: 1.4,
  },
  loginBtn: {
    width: "100%",
    padding: "14px 24px",
    fontSize: 15,
    fontWeight: 700,
    background: "linear-gradient(90deg, #FF327D 0%, #6D2EBF 100%)",
    border: "2px solid #FF327D",
    borderRadius: 11,
    color: "white",
    marginTop: 6,
    boxShadow: "0 10px 34px rgba(255,50,125,0.4)",
    transition: "transform 0.15s, box-shadow 0.15s",
  },
  loginLogo: {
    display: "block", margin: "26px auto 0", height: 54, width: "auto", opacity: 0.95,
  },

  // ── Menú (hub) ──
  hubPage: {
    minHeight: "100vh",
    background: "#ffffff url('/FONDO.png') center center / cover no-repeat fixed",
    display: "flex", flexDirection: "column",
  },
  hubTopbar: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "12px 28px",
    background: "linear-gradient(90deg, #41276B 0%, #613BA0 55%, #E9407E 100%)",
  },
  hubLogo: { height: 42, width: "auto" },
  hubTopbarRight: { display: "flex", alignItems: "center", gap: 14 },
  hubLogout: {
    background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.3)",
    color: "#fff", fontSize: 14, fontWeight: 500, padding: "8px 18px",
    borderRadius: 8, cursor: "pointer",
  },
  hubAvatar: {
    width: 38, height: 38, borderRadius: "50%", background: "#fff",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  hubMain: {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center",
    padding: "40px 24px",
  },
  hubTitle: {
    fontSize: "clamp(26px, 4vw, 34px)", fontWeight: 800, color: "#41276B",
    margin: "0 0 6px", textAlign: "center",
  },
  hubSubtitle: {
    fontSize: 15, color: "#5b5b6b", margin: "0 0 46px", textAlign: "center",
  },
} satisfies Record<string, CSSProperties>;
