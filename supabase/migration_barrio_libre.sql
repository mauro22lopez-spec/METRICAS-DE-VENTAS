-- ============================================
-- Migración: barrio de select fijo (tabla `barrios`) a texto libre
-- Previnca Salud — Métricas de Ventas
--
-- Corré esto en el SQL Editor de Supabase SOLO si tu proyecto ya tiene
-- la versión anterior del schema (con tabla `barrios` y la columna
-- `registros_diarios.barrio_id`). Si estás armando el proyecto desde
-- cero, usá directamente supabase/schema.sql.
--
-- Es seguro re-ejecutar este script si algo falla a mitad de camino.
-- ============================================

-- 1) Agregar la columna de texto libre
ALTER TABLE registros_diarios ADD COLUMN IF NOT EXISTS barrio TEXT;

-- 2) Copiar el nombre del barrio desde la tabla vieja, para no perder datos
UPDATE registros_diarios r
SET barrio = b.nombre
FROM barrios b
WHERE r.barrio_id = b.id
  AND r.barrio IS NULL;

-- 3) Completar cualquier registro huérfano (por si el barrio_id ya no existía)
UPDATE registros_diarios
SET barrio = 'Sin especificar'
WHERE barrio IS NULL;

-- 4) Hacer la columna obligatoria
ALTER TABLE registros_diarios ALTER COLUMN barrio SET NOT NULL;

-- 5) Extensión + índice para búsquedas parciales case-insensitive (historial por barrio)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_registros_barrio_trgm ON registros_diarios USING gin (barrio gin_trgm_ops);

-- 6) Recrear las vistas agregadas usando el barrio de texto
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
    THEN ROUND(SUM(atendidos)::numeric / SUM(visitas) * 100, 1)
    ELSE 0
  END AS tasa_contacto,
  CASE WHEN SUM(visitas) > 0
    THEN ROUND(SUM(ventas)::numeric / SUM(visitas) * 100, 1)
    ELSE 0
  END AS tasa_venta,
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
    THEN ROUND(SUM(atendidos)::numeric / SUM(visitas) * 100, 1)
    ELSE 0
  END AS tasa_contacto,
  CASE WHEN SUM(visitas) > 0
    THEN ROUND(SUM(ventas)::numeric / SUM(visitas) * 100, 1)
    ELSE 0
  END AS tasa_venta,
  COUNT(DISTINCT fecha) AS dias_trabajados
FROM registros_diarios
GROUP BY date_trunc('month', fecha), grupo_id, barrio;

-- 7) Quitar la columna vieja (FK a `barrios`) y su índice
DROP INDEX IF EXISTS idx_registros_barrio;
ALTER TABLE registros_diarios DROP COLUMN IF EXISTS barrio_id;

-- 8) Borrar la tabla `barrios`, ya no se usa (los nombres quedaron copiados en el paso 2)
DROP TABLE IF EXISTS barrios;
