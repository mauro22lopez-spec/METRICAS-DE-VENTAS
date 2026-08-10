# METRICAS-DE-VENTAS

App de métricas de ventas domiciliarias para Previnca Salud (Gran Rosario).

## Páginas

- **`metricas.html`** — App principal conectada a Supabase. Carga diaria de métricas por grupo y barrio (turno mañana/tarde), recomendación automática de "seguir en el barrio" vs "cambiar de barrio", vista semanal, vista mensual, comparativa entre barrios e historial acumulado por barrio.
- `index.html` — Reporte a partir de un CSV exportado (sin persistencia, solo en el navegador).
- `app.html` — Registro de visitas sobre un mapa.
- `reporte.html` — Reporte simple a partir de CSV.

## Puesta en marcha de `metricas.html` (Supabase)

1. Andá a [supabase.com](https://supabase.com) y creá un proyecto nuevo (gratis).
2. En **Settings → API** copiá la **Project URL** y la **anon public key**.
3. En el **SQL Editor** de tu proyecto:
   - Si es un proyecto **nuevo**, pegá y ejecutá el contenido completo de [`supabase/schema.sql`](supabase/schema.sql). Esto crea la tabla `grupos`, la tabla `registros_diarios` (el barrio se guarda como texto libre, no como lista cerrada), las vistas `metricas_semanales` y `metricas_mensuales`, los grupos iniciales (Francolini/Mudry/Zarate/Ameli) y las políticas de acceso (RLS).
   - Si ya habías corrido una versión anterior de este schema (con tabla `barrios` y `registros_diarios.barrio_id`), **no** vuelvas a correr `schema.sql`: ejecutá en cambio [`supabase/migration_barrio_libre.sql`](supabase/migration_barrio_libre.sql), que convierte el barrio a texto libre sin perder los datos ya cargados.
4. Abrí `metricas.html` en un editor de texto y completá el bloque `SUPABASE_CONFIG` al principio del `<script>` final:
   ```js
   const SUPABASE_CONFIG = {
     url: "https://tu-proyecto.supabase.co",
     anonKey: "tu-anon-key"
   };
   ```
5. Abrí `metricas.html` en el navegador (podés subirlo a cualquier hosting estático, o abrirlo directo desde el archivo).

## Uso diario

1. A la mañana, cargá las métricas del recorrido por grupo y barrio en la pestaña **Carga del día** (visitas, atendidos, ventas, datos, obra social, ausentes). El barrio se escribe libremente en un campo de texto: a medida que cargás datos, la app va sugiriendo (autocomplete) los barrios ya usados, pero siempre podés escribir uno nuevo. Al guardar aparece la recomendación para la tarde.
2. La recomendación sigue estas reglas de negocio:
   - Tasa de contacto ≥ 50% y ventas ≥ 2 → **Seguir en el barrio — buen rendimiento**
   - Tasa de contacto ≥ 40% y ventas ≥ 1 → **Seguir — rendimiento aceptable, insistir**
   - Tasa de contacto < 40% → **Cambiar de barrio — bajo contacto**
   - 0 ventas y ≥ 3 datos → **Seguir — hay interés, cerrar en tarde**
   - 0 ventas y < 3 datos → **Cambiar de barrio — sin resultados**
3. A la tarde, cargá el resultado del turno tarde (mismo barrio o el que se eligió cambiar) en la misma pestaña.
4. Usá **Vista semanal** y **Vista mensual** para ver agregados y comparar el rendimiento entre barrios y grupos.
5. Usá **Historial por barrio** para buscar un barrio (búsqueda parcial, ej. "eche" encuentra "Echesortu") y ver todo lo cargado ahí: KPIs acumulados, la comparación de rendimiento entre turno mañana y tarde, y la tabla cronológica completa de registros con sus notas.
