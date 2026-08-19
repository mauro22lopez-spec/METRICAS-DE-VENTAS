/**
 * Previnca Salud — captura de teléfonos hacia la tabla `contactos` de Supabase.
 *
 * QUÉ ES: un fragmento para AGREGAR al proceso automático (Google Apps Script)
 * que ya lee los CSV del Drive y los carga en Supabase. Con esto, además de las
 * métricas, el proceso guarda los teléfonos del campo "Número de teléfono" de
 * Map Marker (columna "Phone number" del CSV) en la tabla `contactos`, para que
 * la base de contactos de la app se llene sola.
 *
 * REQUISITO: correr una vez supabase/contactos.sql en el SQL Editor (crea la tabla).
 *
 * CÓMO USARLO: por cada CSV que el proceso procesa, llamá a guardarContactos()
 * pasándole el texto del CSV, el barrio (nombre del archivo), el grupo_id del
 * líder (la carpeta) y la fecha del recorrido. Ejemplo al final.
 */

// Completá con los datos de tu proyecto (Supabase → Settings → API).
// Para escribir conviene la service_role key (guardala en Script Properties, no en el código).
var SUPABASE_URL = 'https://mxgkkeangcuqxlvrekqx.supabase.co';
var SUPABASE_KEY = PropertiesService.getScriptProperties().getProperty('SUPABASE_KEY'); // service_role o anon

/**
 * Extrae los teléfonos de un CSV de Map Marker y los sube a `contactos`.
 * @param {string} csvText  contenido del archivo CSV
 * @param {string} barrio   nombre del barrio (normalmente el nombre del archivo)
 * @param {string} grupoId  UUID del grupo/líder (de la tabla grupos)
 * @param {string} fecha    fecha del recorrido en formato AAAA-MM-DD
 * @return {number} cantidad de teléfonos enviados
 */
function guardarContactos(csvText, barrio, grupoId, fecha) {
  var filas = Utilities.parseCsv(csvText); // maneja comas y comillas
  if (!filas || filas.length < 2) return 0;

  // Ubicar columnas por encabezado (insensible a mayúsculas).
  var head = filas[0].map(function (h) { return (h || '').trim().toLowerCase(); });
  var iDesc = head.indexOf('description');
  var iTel  = head.indexOf('phone number');
  var iDir  = head.indexOf('title');
  if (iDesc === -1 || iTel === -1) return 0; // sin estado o sin teléfono, no hay nada que capturar

  var vistos = {}, rows = [];
  for (var r = 1; r < filas.length; r++) {
    var fila = filas[r];
    if (!fila || fila.length <= iDesc) continue;
    var estado = normEstado(fila[iDesc]);
    if (['venta', 'dato', 'obra'].indexOf(estado) === -1) continue; // solo contactos de seguimiento
    var tel = String(fila[iTel] || '').replace(/[^0-9]/g, '');       // solo dígitos
    if (tel.length < 6) continue;
    if (vistos[tel]) continue; vistos[tel] = true;
    rows.push({
      telefono: tel,
      direccion: iDir >= 0 ? String(fila[iDir] || '').trim() : null,
      estado: estado,
      barrio: barrio || null,
      grupo_id: grupoId || null,
      fecha: fecha || null
    });
  }
  if (!rows.length) return 0;

  // Upsert con "no duplicar por teléfono" (INSERT ... ON CONFLICT (telefono) DO NOTHING).
  var resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/contactos?on_conflict=telefono', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      Prefer: 'resolution=ignore-duplicates,return=minimal'
    },
    payload: JSON.stringify(rows),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() >= 300) {
    Logger.log('Error contactos: ' + resp.getResponseCode() + ' ' + resp.getContentText());
    return 0;
  }
  return rows.length;
}

// Reconoce el estado igual que la app.
function normEstado(raw) {
  var s = String(raw || '').toLowerCase().trim();
  if (s.indexOf('venta') > -1) return 'venta';
  if (s.indexOf('dato') > -1) return 'dato';
  if (s.indexOf('obra') > -1) return 'obra';
  if (s.indexOf('ausente') > -1) return 'ausente';
  return 'otro';
}

/* ---- Ejemplo de uso dentro de tu proceso ----
   (cuando ya tenés el CSV de un barrio y sabés grupo, líder y turno)

   var texto  = archivo.getBlob().getDataAsString('UTF-8');
   var barrio = archivo.getName().replace(/\.csv$/i, '');   // el archivo se llama como el barrio
   var grupoId = idDelLider;                                 // UUID de la tabla grupos
   var fecha   = '2026-08-06';                               // fecha del recorrido
   var n = guardarContactos(texto, barrio, grupoId, fecha);
   Logger.log(n + ' teléfonos guardados de ' + barrio);
*/
