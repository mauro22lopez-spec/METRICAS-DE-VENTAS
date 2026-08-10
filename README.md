# METRICAS-DE-VENTAS

App de métricas de ventas domiciliarias para Previnca Salud (Gran Rosario).

## Páginas

- **`index.html`** — App principal unificada. Subís el CSV que exporta tu app de campo, lo asignás a un grupo, barrio y turno, ves el reporte del recorrido (tasa de contacto, ventas, datos, base de contactos) y con un botón lo guardás en Supabase. De ahí salen la recomendación de "seguir en el barrio" vs "cambiar de barrio", el dashboard del día, la vista semanal, la mensual, la comparativa entre barrios y el historial acumulado por barrio.
- `metricas.html` — Redirige a `index.html` (la app se unificó; se mantiene solo para no romper enlaces viejos).
- `app.html` — Registro de visitas sobre un mapa.
- `reporte.html` — Reporte simple a partir de CSV.

## Puesta en marcha (Supabase)

1. Andá a [supabase.com](https://supabase.com) y creá un proyecto nuevo (gratis).
2. En **Settings → API** copiá la **Project URL** y la **anon public key**.
3. En el **SQL Editor** de tu proyecto:
   - Si es un proyecto **nuevo**, pegá y ejecutá el contenido completo de [`supabase/schema.sql`](supabase/schema.sql). Esto crea la tabla `grupos`, la tabla `registros_diarios` (el barrio se guarda como texto libre, no como lista cerrada), las vistas `metricas_semanales`, `metricas_mensuales` y `barrios_usados`, los grupos iniciales (Francolini/Mudry/Zarate/Ameli) y las políticas de acceso (RLS).
   - Si ya habías corrido una versión anterior de este schema (con tabla `barrios` y `registros_diarios.barrio_id`), **no** vuelvas a correr `schema.sql`: ejecutá en cambio [`supabase/migration_barrio_libre.sql`](supabase/migration_barrio_libre.sql), que convierte el barrio a texto libre sin perder los datos ya cargados.
4. Abrí `index.html` en un editor de texto y completá el bloque `SUPABASE_CONFIG` al principio del `<script>` final:
   ```js
   const SUPABASE_CONFIG = {
     url: "https://tu-proyecto.supabase.co",
     anonKey: "tu-anon-key"
   };
   ```
5. Abrí `index.html` en el navegador (podés subirlo a cualquier hosting estático, o abrirlo directo desde el archivo). Sin Supabase configurado el reporte de CSV funciona igual, pero no se guardan métricas ni aparecen las vistas semanal/mensual/historial.

## Uso diario

1. A la mañana, cada grupo sube el CSV de su recorrido en la pestaña **Cargar y reporte**: elegís grupo, escribís el barrio, turno (mañana) y fecha, y cargás el archivo. El barrio se escribe libremente y la app va sugiriendo (autocomplete) los ya usados. Se muestra el reporte al instante.
2. Tocá **Guardar en Supabase** en cada carga para registrar el turno. Aparece la recomendación para la tarde, según estas reglas de negocio:
   - Tasa de contacto ≥ 50% y ventas ≥ 2 → **Seguir en el barrio — buen rendimiento**
   - Tasa de contacto ≥ 40% y ventas ≥ 1 → **Seguir — rendimiento aceptable, insistir**
   - Tasa de contacto < 40% → **Cambiar de barrio — bajo contacto**
   - 0 ventas y ≥ 3 datos → **Seguir — hay interés, cerrar en tarde**
   - 0 ventas y < 3 datos → **Cambiar de barrio — sin resultados**
3. A la tarde, subí y guardá el CSV del turno tarde (mismo barrio o el que se decidió cambiar).
4. Usá **Dashboard**, **Vista semanal** y **Vista mensual** para ver agregados y comparar el rendimiento entre barrios y grupos.
5. Usá **Historial por barrio** para buscar un barrio (búsqueda parcial, ej. "eche" encuentra "Echesortu") y ver todo lo cargado ahí: KPIs acumulados, la comparación de rendimiento entre turno mañana y tarde, y la tabla cronológica completa de registros con sus notas.

### Cómo se mapea el CSV a las métricas

Cada carga de CSV (un grupo en un barrio) se guarda como una fila en `registros_diarios`: **visitas** = total de registros, **atendidos** = total − ausentes, y **ventas / datos / obra social / ausentes** se cuentan desde la columna Description del CSV.
