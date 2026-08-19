-- ============================================
-- Setup completo — Previnca Salud (Métricas de Ventas)
--
-- Este script deja la base en el estado correcto SIN IMPORTAR cómo esté hoy:
-- borra cualquier versión previa (tablas o vistas viejas) y la reconstruye
-- desde cero con el modelo actual (barrio como texto libre).
--
-- ⚠️ OJO: borra los datos que hubiera en registros_diarios. Usalo solo si no
-- tenés métricas reales guardadas que quieras conservar. Si SÍ tenés datos
-- que no querés perder, no uses este script: usá supabase/migration_barrio_libre.sql.
-- ============================================

-- 1) Limpieza de cualquier versión anterior (es seguro aunque no existan)
DROP VIEW  IF EXISTS metricas_semanales;
DROP VIEW  IF EXISTS metricas_mensuales;
DROP VIEW  IF EXISTS barrios_usados;
DROP TABLE IF EXISTS registros_diarios CASCADE;
DROP TABLE IF EXISTS barrios CASCADE;
DROP TABLE IF EXISTS grupos CASCADE;

-- 2) Tablas
CREATE TABLE grupos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#4cc3ff',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE registros_diarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID REFERENCES grupos(id) ON DELETE CASCADE,
  barrio TEXT NOT NULL,
  fecha DATE NOT NULL,
  turno TEXT CHECK (turno IN ('mañana', 'tarde')) DEFAULT 'mañana',
  visitas INTEGER DEFAULT 0,
  atendidos INTEGER DEFAULT 0,
  ventas INTEGER DEFAULT 0,
  datos INTEGER DEFAULT 0,
  obra_social INTEGER DEFAULT 0,
  ausentes INTEGER DEFAULT 0,
  otros INTEGER DEFAULT 0,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3) Índices
CREATE INDEX idx_registros_fecha ON registros_diarios(fecha);
CREATE INDEX idx_registros_grupo ON registros_diarios(grupo_id);
CREATE INDEX idx_registros_barrio ON registros_diarios(barrio);
CREATE INDEX idx_registros_fecha_grupo ON registros_diarios(fecha, grupo_id);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_registros_barrio_trgm ON registros_diarios USING gin (barrio gin_trgm_ops);

-- 4) Vistas agregadas
CREATE OR REPLACE VIEW metricas_semanales AS
SELECT
  date_trunc('week', fecha) AS semana,
  grupo_id,
  barrio,
  SUM(visitas) AS total_visitas,
  SUM(atendidos) AS total_atendidos,
  SUM(ventas) AS total_ventas,
  SUM(datos) AS total_datos,
  SUM(obra_social) AS total_obra_social,
  SUM(ausentes) AS total_ausentes,
  CASE WHEN SUM(visitas) > 0
    THEN ROUND(SUM(atendidos)::numeric / SUM(visitas) * 100, 1) ELSE 0 END AS tasa_contacto,
  CASE WHEN SUM(visitas) > 0
    THEN ROUND(SUM(ventas)::numeric / SUM(visitas) * 100, 1) ELSE 0 END AS tasa_venta,
  COUNT(DISTINCT fecha) AS dias_trabajados
FROM registros_diarios
GROUP BY date_trunc('week', fecha), grupo_id, barrio;

CREATE OR REPLACE VIEW metricas_mensuales AS
SELECT
  date_trunc('month', fecha) AS mes,
  grupo_id,
  barrio,
  SUM(visitas) AS total_visitas,
  SUM(atendidos) AS total_atendidos,
  SUM(ventas) AS total_ventas,
  SUM(datos) AS total_datos,
  SUM(obra_social) AS total_obra_social,
  SUM(ausentes) AS total_ausentes,
  CASE WHEN SUM(visitas) > 0
    THEN ROUND(SUM(atendidos)::numeric / SUM(visitas) * 100, 1) ELSE 0 END AS tasa_contacto,
  CASE WHEN SUM(visitas) > 0
    THEN ROUND(SUM(ventas)::numeric / SUM(visitas) * 100, 1) ELSE 0 END AS tasa_venta,
  COUNT(DISTINCT fecha) AS dias_trabajados
FROM registros_diarios
GROUP BY date_trunc('month', fecha), grupo_id, barrio;

CREATE OR REPLACE VIEW barrios_usados AS
SELECT DISTINCT barrio FROM registros_diarios ORDER BY barrio;

-- 5) Grupos iniciales
INSERT INTO grupos (nombre, color) VALUES
  ('Francolini', '#4cc3ff'),
  ('Mudry', '#34d399'),
  ('Zarate', '#fbbf24'),
  ('Ameli', '#c4b5fd');

-- 6) Seguridad de acceso (RLS)
ALTER TABLE grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_diarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON grupos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON registros_diarios FOR ALL USING (true) WITH CHECK (true);
