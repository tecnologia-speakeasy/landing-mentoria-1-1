-- =============================================================================
-- Esquema AISLADO para el agendamiento de mentorías 1:1.
-- Vive en la misma base de datos que 'agendamiento' (evaluación), pero no lee
-- ni modifica ninguna de sus tablas.
-- Idempotente: se puede correr varias veces sin romper nada (npm run db:setup).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS mentoria;

-- Profesores -----------------------------------------------------------------
-- Se cargan con `npm run db:seed` desde db/profesores.json. Las credenciales de
-- Zoom NO van en el JSON: se actualizan directamente en la tabla.
CREATE TABLE IF NOT EXISTS mentoria.profesores (
  id                  serial PRIMARY KEY,
  nombre              text NOT NULL,
  slug                text UNIQUE NOT NULL,
  foto_url            text,
  -- Credenciales Zoom Server-to-Server OAuth (una por profesor). Null hasta crearlas.
  zoom_account_id     text,
  zoom_client_id      text,
  zoom_client_secret  text,
  zoom_user_email     text,
  activo              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Disponibilidad semanal por profesor (día de semana + inicio de franja).
-- dia_semana usa ISO DOW: 1=Lunes ... 7=Domingo (coincide con extract(isodow)).
CREATE TABLE IF NOT EXISTS mentoria.disponibilidad (
  profesor_id  int  NOT NULL REFERENCES mentoria.profesores(id) ON DELETE CASCADE,
  dia_semana   int  NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  hora_inicio  time NOT NULL,
  PRIMARY KEY (profesor_id, dia_semana, hora_inicio)
);

-- Búsqueda rápida de "quién está disponible en este día+hora".
CREATE INDEX IF NOT EXISTS ix_disponibilidad_dia_hora
  ON mentoria.disponibilidad (dia_semana, hora_inicio);

-- Lista blanca de estudiantes autorizados ------------------------------------
-- Solo estos correos pueden ingresar y agendar. Se guardan en minúsculas.
-- Cargar con:  npm run db:load-emails -- ruta/al/archivo.csv
CREATE TABLE IF NOT EXISTS mentoria.estudiantes_autorizados (
  id          serial PRIMARY KEY,
  email       text NOT NULL UNIQUE,
  manychat_id text,                          -- ID del contacto en ManyChat (WhatsApp)
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Estudiantes que han ingresado/agendado (el nombre se captura en el login) --
CREATE TABLE IF NOT EXISTS mentoria.estudiantes (
  id          serial PRIMARY KEY,
  email       text UNIQUE NOT NULL,
  nombre      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Citas de mentoría ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mentoria.citas (
  id              serial PRIMARY KEY,
  profesor_id     int NOT NULL REFERENCES mentoria.profesores(id),
  estudiante_id   int NOT NULL REFERENCES mentoria.estudiantes(id),
  fecha           date NOT NULL,
  hora_inicio     time NOT NULL,
  duracion_min    int NOT NULL DEFAULT 30,
  estado          text NOT NULL DEFAULT 'confirmada',  -- confirmada | cancelada
  zoom_meeting_id text,
  zoom_join_url   text,
  zoom_start_url  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Un profesor NO puede tener dos citas activas en el mismo slot.
CREATE UNIQUE INDEX IF NOT EXISTS uq_profesor_slot_activa
  ON mentoria.citas (profesor_id, fecha, hora_inicio)
  WHERE estado = 'confirmada';

-- Un estudiante solo puede tener UNA mentoría activa (si se cancela, puede
-- re-agendar). Para permitir varias, eliminar este índice y la validación
-- 'ya_agendo' de lib/agenda/booking.ts.
CREATE UNIQUE INDEX IF NOT EXISTS uq_estudiante_activa
  ON mentoria.citas (estudiante_id)
  WHERE estado = 'confirmada';

-- Índice para el cálculo de carga por profesor.
CREATE INDEX IF NOT EXISTS ix_citas_profesor_estado
  ON mentoria.citas (profesor_id, estado);
