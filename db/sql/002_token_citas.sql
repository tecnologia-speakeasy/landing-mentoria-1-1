-- =============================================================================
-- Token aleatorio por cita para el enlace corto /unirse/<token>, que redirige al
-- Zoom de la mentoría. Lo usa el botón "Unirse" de la plantilla de WhatsApp: la
-- URL del botón queda fija en Meta y solo admite una variable al final.
-- Idempotente.
-- =============================================================================

ALTER TABLE mentoria.citas ADD COLUMN IF NOT EXISTS token text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_citas_token
  ON mentoria.citas (token);
