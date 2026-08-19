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

-- 2) Copiar el nombre del barrio desde la tabla vieja, para no perder datos.
--    Va dentro de un bloque condicional para que el script siga funcionando
--    si se lo vuelve a ejecutar cuando `barrios`/`barrio_id` ya no existen.
DO $$
BEGIN
  IF to_regclass('public.barrios') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'registros_diarios' AND column_name = 'barrio_id') THEN
    UPDATE registros_diarios r
    SET barrio = b.nombre
    FROM barrios b
    WHERE r.barrio_id = b.id
      AND r.barrio IS NULL;
  END IF;
END $$;

-- 3) Completar cualquier registro huérfano (por si el barrio_id ya no existía)
UPDATE registros_diarios
SET barrio = 'Sin especificar'
WHERE barrio IS NULL;

-- 4) Hacer la columna obligatoria
ALTER TABLE registros_diarios ALTER COLUMN barrio SET NOT NULL;

-- 5) Borrar las vistas viejas. Hay que hacerlo antes de tocar la columna:
--    dependen de `barrio_id`, y además CREATE OR REPLACE VIEW no permite
--    renombrar una columna existente (barrio_id -> barrio), así que las
--    vistas se recrean desde cero más abajo.
DROP VIEW IF EXISTS metricas_semanales;
DROP VIEW IF EXISTS metricas_mensuales;

-- 6) Quitar la columna vieja (FK a `barrios`). Esto borra en cascada el
--    índice viejo `idx_registros_barrio` (estaba definido sobre barrio_id),
--    así que hay que hacerlo ANTES de crear el índice nuevo con ese mismo
--    nombre sobre la columna de texto (si no, el paso 8 sería un no-op por
--    el "IF NOT EXISTS" y la tabla quedaría sin índice sobre barrio).
ALTER TABLE registros_diarios DROP COLUMN IF EXISTS barrio_id;

-- 7) Borrar la tabla `barrios`, ya no se usa (los nombres quedaron copiados en el paso 2)
DROP TABLE IF EXISTS barrios;

-- 8) Índices: uno normal para filtros exactos (.eq/.in) y uno trigram para
--    búsquedas parciales case-insensitive (ilike '%texto%' en el historial por barrio)
CREATE INDEX IF NOT EXISTS idx_registros_barrio ON registros_diarios(barrio);
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_registros_barrio_trgm ON registros_diarios USING gin (barrio gin_trgm_ops);

-- 9) Recrear las vistas agregadas usando el barrio de texto
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

-- Barrios ya usados, para alimentar el autocomplete sin traer todos los
-- registros (una fila por barrio en vez de una por visita).
CREATE OR REPLACE VIEW barrios_usados AS
SELECT DISTINCT barrio FROM registros_diarios ORDER BY barrio;
