/*************************************************************************
 *  CONECTOR: Map Marker (CSV en Drive) -> Supabase  ·  Previnca Salud
 *
 *  Flujo:
 *    Reportes/
 *      Francolini/  -> manana/  tarde/
 *      Mudry/       -> manana/  tarde/
 *      Zarate/      -> manana/  tarde/
 *      Ameli/       -> manana/  tarde/
 *
 *  - El GRUPO sale de la carpeta de nivel 1.
 *  - El TURNO sale de la subcarpeta (manana/tarde).
 *  - El BARRIO sale del NOMBRE del archivo, tomando la parte ANTES del "_".
 *      Ej: "alberdi_baez.csv"  -> barrio "alberdi"  (apellido se ignora)
 *          "alberdi.csv"       -> barrio "alberdi"  (compatibilidad)
 *  - La FECHA es la de hoy, SALVO que el nombre del archivo traiga una fecha
 *    (para cargar días anteriores). Acepta AAAA-MM-DD o DD-MM-AAAA.
 *      Ej: "alberdi_baez_2026-08-05.csv" -> se guarda con fecha 2026-08-05
 *          "alberdi_baez.csv"            -> se guarda con la fecha de hoy
 *  - Cada pin trae su estado en la columna "Description".
 *
 *  ────────────────────────────────────────────────────────────────────
 *  MODO ACUMULATIVO (Opción 1) + PROCESADOS
 *  ────────────────────────────────────────────────────────────────────
 *  Son 24 vendedores (6 por grupo) que cargan a lo largo del turno, NO
 *  todos a la vez. Por eso:
 *
 *    1. Cada archivo se procesa UNA sola vez.
 *    2. Al procesarlo, sus conteos se SUMAN al registro que ya exista en
 *       Supabase para ese grupo+turno+fecha+barrio (no se reemplaza).
 *    3. Después de sumarlo, el archivo se MUEVE a "procesados/" dentro de
 *       su carpeta grupo/turno, para que el trigger no lo vuelva a leer.
 *
 *  IMPORTANTE (consecuencia del modo acumulativo):
 *    - Como el script SUMA en vez de reemplazar, si un vendedor exporta
 *      dos veces el MISMO archivo, se contaría dos veces. La disciplina
 *      de nombrado (un archivo por vendedor por barrio) evita esto.
 *    - Si necesitás RECALCULAR un barrio desde cero, borrá el registro a
 *      mano en Supabase; el script ya no lo borra solo.
 *
 *  ────────────────────────────────────────────────────────────────────
 *  SERVICIO ASISTENCIAL vs PREVINCA
 *  ────────────────────────────────────────────────────────────────────
 *  - Las columnas sa_ciba, sa_copeto, ... son COMPETENCIA (servicio ajeno).
 *  - sa_previnca es NUESTRO servicio ya existente en esa casa (cliente
 *    Previnca de antes). Se cuenta técnicamente igual (suma en visitas y
 *    atendidos), pero conviene leerlo SEPARADO de la competencia porque
 *    mide penetración propia, no competencia.
 *  - Requiere que la columna exista en la tabla. Corré en Supabase:
 *      ALTER TABLE registros_diarios
 *      ADD COLUMN IF NOT EXISTS sa_previnca integer NOT NULL DEFAULT 0;
 *
 *  Reglas de conteo (confirmadas):
 *    visitas   = todos los pins CLASIFICADOS (con estado reconocido)
 *    atendidos = visitas - ausentes
 *    sa_xxx / sa_previnca = cada uno cuenta lo suyo (y suma en visitas/atendidos)
 *    pin vacío o no reconocido -> se IGNORA y se avisa por mail
 *
 *    Un mismo pin PUEDE traer más de un estado a la vez si el vendedor
 *    escribe ambos en la Descripción (ej: "Obra Social y Ciba"). En ese
 *    caso se cuentan LAS DOS categorías (obra_social Y sa_ciba), no solo
 *    una. Ojo: como "visitas" suma todas las categorías, ese único pin
 *    físico pesa 2 en el total de visitas (una por cada categoría que
 *    trajo), igual que ya pasa hoy con sa_previnca.
 *
 *  Barrios: se acepta CUALQUIER barrio que venga en el nombre del archivo.
 *  No se valida contra ninguna lista, así los barrios nuevos entran solos.
 *
 *  ────────────────────────────────────────────────────────────────────
 *  BASE DE CONTACTOS (teléfonos)
 *  ────────────────────────────────────────────────────────────────────
 *  Además de contar, cada pin de Venta, Dato u Obra Social que tenga
 *  algo cargado en "Phone number" se guarda en la tabla `contactos`
 *  (columna Title = dirección). Requiere correr una vez en Supabase:
 *      supabase/contactos.sql
 *  Un teléfono se guarda UNA sola vez en toda la base (no se actualiza
 *  si vuelve a aparecer en otro barrio/fecha; queda el primer registro).
 *  Un error al guardar contactos NUNCA aborta el procesamiento del
 *  archivo: las métricas y el movido a procesados/ siguen andando igual
 *  aunque falle esta parte.
 *************************************************************************/


/* =========================== CONFIGURACIÓN =========================== */

const SUPABASE_URL        = 'https://mxgkkeangcuqxlvrekqx.supabase.co';
const SUPABASE_SECRET_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im14Z2trZWFuZ2N1cXhsdnJla3F4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyOTE1MTAsImV4cCI6MjEwMDg2NzUxMH0.SLS9yrUfBvl4UoRTXi3QBVM8TXVhNlydR4l2Vg9i01s';            // Settings → API Keys (ver nota de seguridad)
const CARPETA_REPORTES_ID = '1fEKETs9_DDspoM-uGgLw0EHqv7wfih4W';
const EMAIL_ALERTAS       = 'mauro22lopez@gmail.com';
const TZ                  = 'America/Argentina/Cordoba';
const NOMBRE_PROCESADOS   = 'procesados';

// Carpeta nivel 1 -> grupo_id (tabla grupos)
const GRUPOS = {
  'francolini': '32b58050-9b86-4427-bda0-3215663ad6b3',
  'mudry':      'e9764f3c-a354-4b1b-bc28-b824a63a8455',
  'zarate':     '00c23c36-994a-4611-afa3-ad18902044bf',
  'ameli':      '4551948f-1be6-4a71-a81f-c2c6b2c05bdd'
};

// Subcarpeta -> valor de turno en la BD (con acento, como espera el CHECK)
const TURNOS = { 'manana': 'mañana', 'mañana': 'mañana', 'tarde': 'tarde' };

const COLUMNA_ESTADO = 'Description';

/* Estados "clásicos": el pin debe CONTENER la clave (normalizado). */
const ESTADOS_BASE = [
  { col: 'ventas',      claves: ['venta'] },
  { col: 'obra_social', claves: ['obra social', 'obrasocial'] },
  { col: 'datos',       claves: ['dato'] },
  { col: 'ausentes',    claves: ['ausente'] }
];

/* Competencias + Previnca: basta con que la clave APAREZCA en el texto
   (igual que ESTADOS_BASE), así un pin puede traer una competencia junto
   con un estado base (ej: "Obra Social y Ciba" cuenta las dos cosas).
   'previnca' -> sa_previnca (nuestro servicio existente). */
const COMPETENCIAS = {
  'ciba':            'sa_ciba',
  'copeto':          'sa_copeto',
  'bassi':           'sa_bassi',
  'oeste':           'sa_oeste',
  'pocho bernardo':  'sa_pocho_bernardo',
  'cgyl':            'sa_cgyl',
  'novara':          'sa_novara',
  'global':          'sa_global',
  'games':           'sa_games',
  'previnca':        'sa_previnca'
};

/* Columnas numéricas que se acumulan (incluye sa_previnca). */
const COLS_NUM = ['ventas','datos','obra_social','ausentes',
  'sa_ciba','sa_copeto','sa_bassi','sa_oeste','sa_pocho_bernardo',
  'sa_cgyl','sa_novara','sa_global','sa_games','sa_previnca'];


/* ============================ PRINCIPAL ============================== */

/**
 * Dispara el activador por tiempo.
 * (⏰ Activadores → procesarReportes → cada 15 min recomendado)
 */
function procesarReportes() {
  const raiz = DriveApp.getFolderById(CARPETA_REPORTES_ID);
  const fechaHoy = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');

  const gruposIter = raiz.getFolders();
  while (gruposIter.hasNext()) {
    const carpetaGrupo = gruposIter.next();
    const grupoId = GRUPOS[norm(carpetaGrupo.getName())];
    if (!grupoId) { Logger.log('Grupo desconocido: ' + carpetaGrupo.getName()); continue; }

    const turnosIter = carpetaGrupo.getFolders();
    while (turnosIter.hasNext()) {
      const carpetaTurno = turnosIter.next();
      const nombreTurno = norm(carpetaTurno.getName());
      if (nombreTurno === NOMBRE_PROCESADOS) continue;
      const turnoBD = TURNOS[nombreTurno];
      if (!turnoBD) { Logger.log('Turno desconocido: ' + carpetaTurno.getName()); continue; }

      procesarCarpeta(carpetaTurno, grupoId, turnoBD, fechaHoy);
    }
  }
}

/**
 * Procesa cada CSV nuevo (no procesado) de una carpeta grupo/turno.
 * Cada archivo: se cuenta, se SUMA al registro de Supabase, y se MUEVE
 * a procesados/. Los archivos ya en procesados/ no se tocan.
 */
function procesarCarpeta(carpeta, grupoId, turnoBD, fechaHoy) {
  const iter = carpeta.getFiles();
  while (iter.hasNext()) {
    const f = iter.next();
    const nombre = f.getName();
    const mime = f.getMimeType();

    // Aceptamos: archivos .csv reales, archivos de texto/CSV por MIME, y
    // Google Sheets (Drive convierte los CSV subidos y les saca la extensión).
    const esCsvPorNombre = /\.csv$/i.test(nombre);
    const esCsvPorMime   = (mime === 'text/csv' || mime === 'text/comma-separated-values' || mime === 'text/plain');
    const esGoogleSheet  = (mime === MimeType.GOOGLE_SHEETS);
    if (!esCsvPorNombre && !esCsvPorMime && !esGoogleSheet) continue;

    // Barrio = parte antes del primer "_". Se acepta CUALQUIER barrio.
    const base = nombre.replace(/\.csv$/i, '').replace(/\s*\(\d+\)\s*$/, '').trim();
    const barrio = base.split('_')[0].trim();

    if (!barrio) {
      avisar('Nombre de archivo sin barrio',
        'El archivo "' + nombre + '" (' + turnoBD + ') no tiene un barrio válido antes del "_". ' +
        'Quedó en la carpeta. El nombre debe ser barrio_apellido.csv');
      continue;
    }

    // Fecha del recorrido: si el nombre del archivo trae una fecha (para cargar
    // días viejos), se usa esa; si no, la de hoy (comportamiento normal).
    const fechaArchivo = fechaDesdeNombre(nombre) || fechaHoy;

    try {
      const parcial = contarPins(f, barrio, turnoBD);
      acumularEnSupabase(grupoId, barrio, fechaArchivo, turnoBD, parcial);
      if (parcial._contactos && parcial._contactos.length) {
        guardarContactos(grupoId, barrio, fechaArchivo, parcial._contactos);
      }
      moverAProcesados(carpeta, f);
      Logger.log('OK sumado %s / %s / %s <- %s', turnoBD, barrio, fechaArchivo, nombre);

      if (parcial._sinClasificar > 0) {
        avisar('Pins sin clasificar',
          'El archivo "' + nombre + '" (' + turnoBD + ', ' + barrio + ') tenía ' +
          parcial._sinClasificar + ' pin(s) con descripción vacía o no reconocida. ' +
          'Esos pins NO se contaron. El resto sí se sumó. Revisá las descripciones.');
      }
    } catch (e) {
      avisar('Error al procesar archivo',
        'Falló "' + nombre + '" (' + turnoBD + ', ' + barrio + '): ' + e.message +
        '. El archivo quedó en su lugar para reintentar.');
      Logger.log('ERROR ' + nombre + ': ' + e.message);
    }
  }
}

/**
 * Lee un CSV y cuenta sus pins. Devuelve conteo + _sinClasificar.
 */
function contarPins(archivo, barrioNombre, turnoBD) {
  let filas;

  if (archivo.getMimeType() === MimeType.GOOGLE_SHEETS) {
    // Google Sheet (Drive convirtió el CSV al subirlo): leemos la hoja directo.
    const hoja = SpreadsheetApp.openById(archivo.getId()).getSheets()[0];
    filas = hoja.getDataRange().getValues();
  } else {
    // CSV / texto plano: leemos el contenido y lo parseamos.
    const texto = archivo.getBlob().getDataAsString('UTF-8');
    filas = Utilities.parseCsv(texto);
  }

  if (!filas || filas.length < 2) throw new Error('Archivo vacío o sin filas de datos: ' + archivo.getName());

  const encabezados = filas[0].map(function (h) { return norm(h); });
  let idx = encabezados.indexOf(norm(COLUMNA_ESTADO));
  if (idx === -1) idx = encabezados.indexOf('descripcion');
  if (idx === -1) throw new Error('No encontré la columna "' + COLUMNA_ESTADO + '" en ' + archivo.getName());

  // Columnas de contacto (Título = dirección, Phone number = teléfono).
  // Si no existen en el CSV, simplemente no se capturan contactos de ese archivo.
  const idxTitulo   = encabezados.indexOf('title');
  const idxTelefono = encabezados.indexOf('phone number');

  const c = conteoVacio();
  let sinClasificar = 0;
  const contactos = [];

  for (let i = 1; i < filas.length; i++) {
    const crudo = (filas[i][idx] || '').toString();
    const estado = norm(crudo);
    if (!estado) { sinClasificar++; continue; }

    let matcheo = false;
    let estadoContacto = null; // primer estado "capturable" (venta/dato/obra) de este pin

    // Competencias: un mismo pin puede traer más de una (ej: "Obra Social y Ciba").
    // Antes exigía que el texto fuera EXACTAMENTE el nombre de la competencia; ahora
    // basta con que aparezca, igual que los estados base de abajo.
    for (const clave in COMPETENCIAS) {
      if (estado.indexOf(clave) !== -1) { c[COMPETENCIAS[clave]]++; matcheo = true; }
    }

    // Estados base: idem, un pin puede combinar más de uno (ej: "Venta y Dato").
    for (let k = 0; k < ESTADOS_BASE.length; k++) {
      const e = ESTADOS_BASE[k];
      if (e.claves.some(function (clave) { return estado.indexOf(clave) !== -1; })) {
        c[e.col]++; matcheo = true;
        if (!estadoContacto && (e.col === 'ventas' || e.col === 'datos' || e.col === 'obra_social')) {
          estadoContacto = e.col === 'ventas' ? 'venta' : (e.col === 'datos' ? 'dato' : 'obra');
        }
      }
    }

    if (!matcheo) { sinClasificar++; continue; }

    // Contacto de seguimiento: uno solo por pin (aunque haya matcheado varias
    // categorías), usando el primer estado capturable como etiqueta.
    if (estadoContacto && idxTelefono !== -1) {
      const tel = String(filas[i][idxTelefono] || '').replace(/[^0-9]/g, '');
      if (tel.length >= 6) {
        contactos.push({
          telefono: tel,
          direccion: idxTitulo !== -1 ? String(filas[i][idxTitulo] || '').trim() : null,
          estado: estadoContacto
        });
      }
    }
  }

  c._sinClasificar = sinClasificar;
  c._contactos = contactos;
  return c;
}


/* ============================ SUPABASE =============================== */

/**
 * ACUMULATIVO: lee el registro existente (si hay), le suma el parcial,
 * recalcula visitas/atendidos, y guarda (PATCH si existía, POST si no).
 */
function acumularEnSupabase(grupoId, barrio, fecha, turnoBD, parcial) {
  const filtro = '?grupo_id=eq.' + grupoId +
                 '&turno=eq.'    + encodeURIComponent(turnoBD) +
                 '&fecha=eq.'    + fecha +
                 '&barrio=eq.'   + encodeURIComponent(barrio) +
                 '&select=*';

  const urlBase = SUPABASE_URL + '/rest/v1/registros_diarios';

  const respGet = UrlFetchApp.fetch(urlBase + filtro, {
    method: 'get', headers: cabeceras(), muteHttpExceptions: true
  });
  if (respGet.getResponseCode() < 200 || respGet.getResponseCode() >= 300) {
    throw new Error('GET falló ' + respGet.getResponseCode() + ': ' + respGet.getContentText());
  }
  const existentes = JSON.parse(respGet.getContentText() || '[]');

  if (existentes.length > 0) {
    const actual = existentes[0];
    const merged = {};
    COLS_NUM.forEach(function (k) { merged[k] = (+actual[k] || 0) + (+parcial[k] || 0); });
    aplicarDerivados(merged);
    merged.otros = 0;
    merged.updated_at = new Date().toISOString();

    const respPatch = UrlFetchApp.fetch(urlBase + '?id=eq.' + actual.id, {
      method: 'patch',
      contentType: 'application/json',
      headers: cabeceras(),
      payload: JSON.stringify(merged),
      muteHttpExceptions: true
    });
    const code = respPatch.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error('PATCH falló ' + code + ': ' + respPatch.getContentText());
    }
  } else {
    const nuevo = { grupo_id: grupoId, barrio: barrio, fecha: fecha, turno: turnoBD };
    COLS_NUM.forEach(function (k) { nuevo[k] = (+parcial[k] || 0); });
    aplicarDerivados(nuevo);
    nuevo.otros = 0;
    nuevo.notas = 'Importado automáticamente (acumulativo)';
    nuevo.updated_at = new Date().toISOString();

    const respPost = UrlFetchApp.fetch(urlBase, {
      method: 'post',
      contentType: 'application/json',
      headers: cabeceras(),
      payload: JSON.stringify(nuevo),
      muteHttpExceptions: true
    });
    const code = respPost.getResponseCode();
    if (code < 200 || code >= 300) {
      throw new Error('POST falló ' + code + ': ' + respPost.getContentText());
    }
  }
}

function cabeceras() {
  return {
    'apikey':        SUPABASE_SECRET_KEY,
    'Authorization': 'Bearer ' + SUPABASE_SECRET_KEY,
    'Prefer':        'return=minimal'
  };
}

/**
 * Guarda en `contactos` los teléfonos capturados de un archivo (Venta,
 * Dato y Obra Social). Deduplica por teléfono en toda la base: si el
 * número ya existe, esta llamada lo ignora sin modificarlo.
 * También deduplica DENTRO del mismo lote (si el mismo teléfono aparece
 * dos veces en el archivo): mandar el mismo teléfono repetido en un solo
 * INSERT con ON CONFLICT hace que Postgres rechace el lote entero.
 * A propósito NUNCA lanza error hacia arriba: un problema acá no debe
 * frenar el guardado de métricas ni el movido del archivo a procesados/.
 */
function guardarContactos(grupoId, barrio, fecha, contactos) {
  try {
    const vistos = {};
    const rows = [];
    contactos.forEach(function (ct) {
      if (vistos[ct.telefono]) return;
      vistos[ct.telefono] = true;
      rows.push({
        telefono: ct.telefono,
        direccion: ct.direccion,
        estado: ct.estado,
        barrio: barrio,
        grupo_id: grupoId,
        fecha: fecha
      });
    });
    if (!rows.length) return;

    const resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/contactos?on_conflict=telefono', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'apikey':        SUPABASE_SECRET_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SECRET_KEY,
        'Prefer':        'resolution=ignore-duplicates,return=minimal'
      },
      payload: JSON.stringify(rows),
      muteHttpExceptions: true
    });

    const code = resp.getResponseCode();
    if (code < 200 || code >= 300) {
      Logger.log('Contactos: fallo %s al guardar %s teléfono(s) de %s: %s', code, rows.length, barrio, resp.getContentText());
    } else {
      Logger.log('Contactos: %s teléfono(s) procesados de %s', rows.length, barrio);
    }
  } catch (e) {
    Logger.log('Contactos: excepción al guardar de ' + barrio + ': ' + e.message);
  }
}


/* ============================ DRIVE ================================= */

/**
 * Mueve un archivo a la subcarpeta procesados/ dentro de la carpeta dada.
 * La crea si no existe. Le antepone fecha/hora para evitar colisiones.
 */
function moverAProcesados(carpeta, archivo) {
  let destino;
  const it = carpeta.getFoldersByName(NOMBRE_PROCESADOS);
  destino = it.hasNext() ? it.next() : carpeta.createFolder(NOMBRE_PROCESADOS);

  const sello = Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss');
  archivo.setName(sello + '__' + archivo.getName());
  archivo.moveTo(destino);
}


/* ============================ UTILIDADES ============================ */

function conteoVacio() {
  const c = { _sinClasificar: 0 };
  COLS_NUM.forEach(function (k) { c[k] = 0; });
  return c;
}

// Calcula visitas y atendidos a partir de las columnas ya sumadas.
// sa_previnca cuenta como servicio asistencial (suma en visitas y atendidos).
function aplicarDerivados(c) {
  const sumaSA = c.sa_ciba + c.sa_copeto + c.sa_bassi + c.sa_oeste + c.sa_pocho_bernardo +
                 c.sa_cgyl + c.sa_novara + c.sa_global + c.sa_games + c.sa_previnca;
  c.visitas   = c.ventas + c.datos + c.obra_social + c.ausentes + sumaSA;
  c.atendidos = c.visitas - c.ausentes;
}

function norm(s) {
  return (s || '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Extrae una fecha del nombre del archivo, para cargar recorridos de d\u00edas
 * anteriores. Acepta AAAA-MM-DD (recomendado, ej: alberdi_baez_2026-08-05)
 * o DD-MM-AAAA (ej: alberdi_baez_05-08-2026), con "-" o "_" como separador.
 * Devuelve 'AAAA-MM-DD' si la fecha es v\u00e1lida y real; si no encuentra una
 * fecha v\u00e1lida en el nombre, devuelve null (y el proceso usa la fecha de hoy).
 */
function fechaDesdeNombre(nombre) {
  const s = String(nombre || '');
  let y, m, d;

  // AAAA-MM-DD  (el a\u00f1o va primero: 4 d\u00edgitos)
  let mm = s.match(/(?:^|[^0-9])(\d{4})[-_](\d{1,2})[-_](\d{1,2})(?:[^0-9]|$)/);
  if (mm) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
  else {
    // DD-MM-AAAA  (el a\u00f1o va \u00faltimo: 4 d\u00edgitos)
    mm = s.match(/(?:^|[^0-9])(\d{1,2})[-_](\d{1,2})[-_](\d{4})(?:[^0-9]|$)/);
    if (mm) { d = +mm[1]; m = +mm[2]; y = +mm[3]; }
    else return null;
  }

  // Validaci\u00f3n: que sea una fecha real (evita 2026-13-40 o typos).
  if (y < 2020 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;

  return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
}

function avisar(asunto, cuerpo) {
  try {
    MailApp.sendEmail(EMAIL_ALERTAS, '[Previnca métricas] ' + asunto, cuerpo);
  } catch (e) {
    Logger.log('No pude enviar mail: ' + e.message);
  }
}


/* ============================ PRUEBA ================================ */

// Ejecutá esto a mano (▶) para probar sin esperar al activador.
function probar() {
  procesarReportes();
  Logger.log('Prueba terminada.');
}
