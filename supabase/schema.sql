-- ============================================
-- Métricas de Ventas Domiciliarias — Previnca Salud
-- Script de creación de base de datos en Supabase
-- Ejecutar completo en el SQL Editor de Supabase
-- ============================================

-- ============================================
-- TABLAS
-- ============================================

CREATE TABLE grupos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#4cc3ff',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE barrios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  zona TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(nombre, zona)
);

CREATE TABLE registros_diarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id UUID REFERENCES grupos(id) ON DELETE CASCADE,
  barrio_id UUID REFERENCES barrios(id) ON DELETE CASCADE,
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

-- Índices para performance
CREATE INDEX idx_registros_fecha ON registros_diarios(fecha);
CREATE INDEX idx_registros_grupo ON registros_diarios(grupo_id);
CREATE INDEX idx_registros_barrio ON registros_diarios(barrio_id);
CREATE INDEX idx_registros_fecha_grupo ON registros_diarios(fecha, grupo_id);

-- ============================================
-- VISTAS AGREGADAS
-- ============================================

CREATE OR REPLACE VIEW metricas_semanales AS
SELECT
  date_trunc('week', fecha) AS semana,
  grupo_id,
  barrio_id,
  SUM(visitas) AS total_visitas,
  SUM(atendidos) AS total_atendidos,
  SUM(ventas) AS total_ventas,
  SUM(datos) AS total_datos,
  SUM(obra_social) AS total_obra_social,
  SUM(ausentes) AS total_ausentes,
  CASE WHEN SUM(visitas) > 0
    THEN ROUND(SUM(atendidos)::numeric / SUM(visitas) * 100, 1)
    ELSE 0
  END AS tasa_contacto,
  CASE WHEN SUM(visitas) > 0
    THEN ROUND(SUM(ventas)::numeric / SUM(visitas) * 100, 1)
    ELSE 0
  END AS tasa_venta,
  COUNT(DISTINCT fecha) AS dias_trabajados
FROM registros_diarios
GROUP BY date_trunc('week', fecha), grupo_id, barrio_id;

CREATE OR REPLACE VIEW metricas_mensuales AS
SELECT
  date_trunc('month', fecha) AS mes,
  grupo_id,
  barrio_id,
  SUM(visitas) AS total_visitas,
  SUM(atendidos) AS total_atendidos,
  SUM(ventas) AS total_ventas,
  SUM(datos) AS total_datos,
  SUM(obra_social) AS total_obra_social,
  SUM(ausentes) AS total_ausentes,
  CASE WHEN SUM(visitas) > 0
    THEN ROUND(SUM(atendidos)::numeric / SUM(visitas) * 100, 1)
    ELSE 0
  END AS tasa_contacto,
  CASE WHEN SUM(visitas) > 0
    THEN ROUND(SUM(ventas)::numeric / SUM(visitas) * 100, 1)
    ELSE 0
  END AS tasa_venta,
  COUNT(DISTINCT fecha) AS dias_trabajados
FROM registros_diarios
GROUP BY date_trunc('month', fecha), grupo_id, barrio_id;

-- ============================================
-- DATOS INICIALES
-- ============================================

INSERT INTO grupos (nombre, color) VALUES
  ('Francolini', '#4cc3ff'),
  ('Mudry', '#34d399'),
  ('Zarate', '#fbbf24'),
  ('Ameli', '#c4b5fd');

INSERT INTO barrios (nombre, zona) VALUES
  ('Centro', 'Rosario'),
  ('Echesortu', 'Rosario'),
  ('Microcentro', 'Rosario'),
  ('Baigorria', 'Gran Rosario'),
  ('Roldán', 'Gran Rosario'),
  ('Funes', 'Gran Rosario');

-- ============================================
-- RLS (Row Level Security)
-- ============================================

ALTER TABLE grupos ENABLE ROW LEVEL SECURITY;
ALTER TABLE barrios ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_diarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all" ON grupos FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON barrios FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON registros_diarios FOR ALL USING (true) WITH CHECK (true);
