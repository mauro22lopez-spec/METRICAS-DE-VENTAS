-- ============================================
-- Base de contactos (teléfonos de la zona de trabajo) — Previnca Salud
--
-- Guarda cada teléfono capturado en el campo "Número de teléfono" de Map Marker
-- (columna "Phone number" del CSV), en los pines con estado Venta, Dato u Obra Social.
-- Se acumula día a día para armar una base de contactos de la zona, exportable a Excel.
--
-- Es ADITIVO y seguro de correr sobre una base que ya tiene datos: no toca
-- grupos ni registros_diarios. Se puede ejecutar más de una vez sin romper nada.
-- ============================================

CREATE TABLE IF NOT EXISTS contactos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefono TEXT NOT NULL,                                   -- solo dígitos
  direccion TEXT,                                           -- Título del pin (dirección)
  estado TEXT,                                              -- venta / dato / obra
  barrio TEXT,
  grupo_id UUID REFERENCES grupos(id) ON DELETE SET NULL,
  fecha DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (telefono)                                         -- un contacto por número (evita duplicados al recargar)
);

CREATE INDEX IF NOT EXISTS idx_contactos_barrio ON contactos(barrio);
CREATE INDEX IF NOT EXISTS idx_contactos_grupo  ON contactos(grupo_id);
CREATE INDEX IF NOT EXISTS idx_contactos_fecha  ON contactos(fecha);

ALTER TABLE contactos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all" ON contactos;
CREATE POLICY "Allow all" ON contactos FOR ALL USING (true) WITH CHECK (true);
