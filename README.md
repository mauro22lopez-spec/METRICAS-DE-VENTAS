# METRICAS-DE-VENTAS

App de métricas de ventas domiciliarias para Previnca Salud (Gran Rosario).

## Páginas

- **`index.html`** — App principal. Dashboard del día, rendimiento Por grupo, vista semanal, mensual, comparativa entre barrios, historial por barrio y **Base de contactos** (teléfonos de la zona, exportable a Excel). La recomendación de "seguir en el barrio" vs "cambiar" sale de esos datos. Tiene además una pestaña de **carga manual (respaldo)**, por si hay que subir un CSV a mano.
- `metricas.html` — Redirige a `index.html` (la app se unificó; se mantiene solo para no romper enlaces viejos).
- `app.html` — Registro de visitas sobre un mapa.
- `reporte.html` — Reporte simple a partir de CSV.

## Cómo llegan las métricas (automático)

Las métricas se cargan solas, sin que nadie toque la app: cada vendedor exporta el CSV de Map Marker y lo sube a su carpeta del Drive:

```
Reportes/
  Francolini/  -> manana/  tarde/
  Mudry/       -> manana/  tarde/
  Zarate/      -> manana/  tarde/
  Ameli/       -> manana/  tarde/
```

Un trigger de Google Apps Script ([`supabase/apps_script_conector_completo.gs`](supabase/apps_script_conector_completo.gs), corriendo cada 15 min) lee los CSV nuevos de esas carpetas y los suma a `registros_diarios` en Supabase:

- El **grupo** sale de la carpeta de nivel 1, el **turno** de la subcarpeta (`manana`/`tarde`).
- El **barrio** sale del nombre del archivo, la parte antes del primer `_` (ej. `alberdi_baez.csv` → barrio `alberdi`).
- Los conteos (ventas, datos, obra social, ausentes, servicio asistencial) se **suman** al registro que ya exista para ese grupo+turno+fecha+barrio, porque varios vendedores cargan a lo largo del turno.
- Cada archivo se procesa una sola vez y se mueve a `procesados/` para no reprocesarlo.
- Además, guarda en la tabla `contactos` el teléfono de cada pin de **Venta, Dato u Obra Social** (ver abajo).

La pestaña de carga manual en `index.html` es solo un respaldo para subir un CSV puntual a mano.

## Base de contactos (teléfonos)

Los vendedores cargan el teléfono en el campo **Número de teléfono** de Map Marker (NO en la descripción, que es solo el estado). Al exportar, ese campo sale como la columna `Phone number` del CSV. Tanto el conector automático como la carga manual capturan los teléfonos de los pines **Venta, Dato y Obra Social** y los acumulan en la tabla `contactos` de Supabase, deduplicados por número (un teléfono se guarda una sola vez en toda la base). La pestaña **Base de contactos** los muestra filtrables por grupo, barrio, estado y fecha, y los exporta a Excel.

- Tabla: ejecutá una vez [`supabase/contactos.sql`](supabase/contactos.sql) en el SQL Editor (es aditivo, no toca las métricas).
- Automático: ya viene integrado en [`supabase/apps_script_conector_completo.gs`](supabase/apps_script_conector_completo.gs) — es el mismo script del conector, no hace falta nada aparte.
- Manual: al **Guardar en Supabase** una carga en la pestaña de respaldo, los teléfonos se guardan solos.

## Puesta en marcha (Supabase)

1. Andá a [supabase.com](https://supabase.com) y creá un proyecto nuevo (gratis).
2. En **Settings → API** copiá la **Project URL** y la **anon public key**.
3. En el **SQL Editor** de tu proyecto:
   - Si es un proyecto **nuevo**, pegá y ejecutá el contenido completo de [`supabase/schema.sql`](supabase/schema.sql). Esto crea la tabla `grupos`, la tabla `registros_diarios` (el barrio se guarda como texto libre, no como lista cerrada), las vistas `metricas_semanales`, `metricas_mensuales` y `barrios_usados`, los grupos iniciales (Francolini/Mudry/Zarate/Ameli) y las políticas de acceso (RLS).
   - Si ya habías corrido una versión anterior de este schema (con tabla `barrios` y `registros_diarios.barrio_id`), **no** vuelvas a correr `schema.sql`: ejecutá en cambio [`supabase/migration_barrio_libre.sql`](supabase/migration_barrio_libre.sql), que convierte el barrio a texto libre sin perder los datos ya cargados.
   - Ejecutá también [`supabase/contactos.sql`](supabase/contactos.sql) para la base de contactos.
4. Abrí `index.html` en un editor de texto y completá el bloque `SUPABASE_CONFIG` al principio del `<script>` final:
   ```js
   const SUPABASE_CONFIG = {
     url: "https://tu-proyecto.supabase.co",
     anonKey: "tu-anon-key"
   };
   ```
5. Abrí `index.html` en el navegador (podés subirlo a cualquier hosting estático, o abrirlo directo desde el archivo). Sin Supabase configurado el reporte de CSV funciona igual, pero no se guardan métricas ni aparecen las vistas semanal/mensual/historial.

## Uso diario

1. Los vendedores cargan las visitas en Map Marker durante el recorrido (dirección en Título, estado en Descripción, teléfono en Número de teléfono) y al terminar el turno exportan el CSV y lo suben a su carpeta del Drive. El conector automático hace el resto.
2. En `index.html`, la pestaña **Dashboard** muestra el día por grupo/turno/barrio con la recomendación:
   - Tasa de contacto ≥ 50% y ventas ≥ 2 → **Seguir en el barrio — buen rendimiento**
   - Tasa de contacto ≥ 40% y ventas ≥ 1 → **Seguir — rendimiento aceptable, insistir**
   - Tasa de contacto < 40% → **Cambiar de barrio — bajo contacto**
   - 0 ventas y ≥ 3 datos → **Seguir — hay interés, cerrar en tarde**
   - 0 ventas y < 3 datos → **Cambiar de barrio — sin resultados**
3. Usá **Por grupo** para ver el rendimiento de un líder en un rango de fechas, **Vista semanal**/**Vista mensual** para agregados, **Comparativa de barrios** y **Historial por barrio** (búsqueda parcial, ej. "eche" encuentra "Echesortu") para la evolución de un barrio con la comparación mañana vs. tarde.
4. Usá **Base de contactos** para filtrar y exportar a Excel los teléfonos capturados.
