/**
 * ContaBot — Registro de gastos/ingresos por Telegram con clasificación Claude.
 * Arquitectura: Telegram → Apps Script (este código) → Claude API → Google Sheets.
 * Costo cero de infraestructura. Sin Railway, sin backend externo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SETUP (una sola vez):
 *  1. Editor Apps Script → Configuración del proyecto → Propiedades del script.
 *     Agregá estas propiedades (o corré setupProperties() abajo con tus valores):
 *       TELEGRAM_TOKEN   → token de @BotFather
 *       ANTHROPIC_KEY    → tu API key de Anthropic (sk-ant-...)
 *       SHEET_ID         → ID de tu Google Sheet (el de la URL .../d/SHEET_ID/edit)
 *       SHEET_NAME       → nombre de la hoja, ej: "Registro 2026"
 *       ALLOWED_CHAT_ID  → tu chat id de Telegram (para que nadie más use el bot)
 *  2. Implementar → Nueva implementación → App web → Ejecutar como: yo /
 *     Acceso: cualquiera. Copiá la URL /exec.
 *  3. Corré setWebhook() una vez (apunta Telegram a esta app).
 *  4. Corré test() para validar Sheet + Claude sin pasar por Telegram.
 *  5. Escribile al bot: "mcdonalds 12500 con visa".
 *
 *  ¿No sabés tu ALLOWED_CHAT_ID? Dejala vacía, mandale un mensaje al bot,
 *  y miralo en Ejecuciones (Logger imprime el chatId de cada mensaje).
 * ─────────────────────────────────────────────────────────────────────────
 */

// ===== CONFIG =====
const P = PropertiesService.getScriptProperties();
const TELEGRAM_TOKEN = P.getProperty('TELEGRAM_TOKEN');
const ANTHROPIC_KEY  = P.getProperty('ANTHROPIC_KEY');
const SHEET_ID       = P.getProperty('SHEET_ID');
const SHEET_NAME     = P.getProperty('SHEET_NAME') || 'Registro 2026';
const ALLOWED_CHAT   = P.getProperty('ALLOWED_CHAT_ID') || '';

const MODEL = 'claude-haiku-4-5-20251001'; // rápido y barato para clasificar
const DEFAULT_MEDIO = 'Santander - TC Visa';
const ID_PREFIX = '26'; // prefijo de los IDs (26-0001)

// ===== CATÁLOGOS CERRADOS (deben coincidir con tu dashboard) =====
const CATS_EGRESO = ['Comida','Supermercado','Transporte','Vehículo','Servicios','Salud',
  'Educación','Entradas/Eventos','Regalos','Ropa','Actividades','Crédito/Cuotas',
  'Gastos importantes','Deuda Marie','Ahorro USD','Otros'];
const CATS_INGRESO = ['Sueldo','Bono/Extra','Reintegro','Préstamo recibido','Otros'];
const MEDIOS = ['Santander - Caja Ahorro ARS','Santander - Caja Ahorro USD','Santander - Débito',
  'Santander - TC Visa','Santander - TC AmEx','Mercado Pago - Saldo','Mercado Pago - TC Visa',
  'Mercado Pago - TC AmEx','Efectivo'];

// Orden EXACTO de columnas en la hoja (18)
const COLS = ['ID','Fecha','Hora','Mes','Tipo','Categoría','Subcat (orig)','Concepto / Comercio',
  'Contraparte','Monto','Divisa','Medio de Pago','Cuota N','Cuota Tot','Reintegrable',
  'Asociado a','Estado','Descripción'];

// ===================================================================
// WEBHOOK
// ===================================================================
function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);

    if (update.callback_query) {
      handleCallback(update.callback_query);
    } else if (update.message && update.message.text) {
      const chatId = String(update.message.chat.id);
      Logger.log('chatId=' + chatId + ' | ' + update.message.text);
      if (ALLOWED_CHAT && chatId !== ALLOWED_CHAT) return ok(); // ignorar a terceros
      handleMessage(update.message);
    }
  } catch (err) {
    Logger.log('doPost ERROR: ' + err);
  }
  return ok();
}
function ok() { return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT); }

// ===================================================================
// MENSAJES DE TEXTO
// ===================================================================
function handleMessage(msg) {
  const chatId = String(msg.chat.id);
  const text = msg.text.trim();

  if (text === '/start') { tgSend(chatId, msgStart()); return; }
  if (text === '/help' || text === '/ayuda') { tgSend(chatId, msgHelp()); return; }
  if (text === '/deshacer' || text === '/undo') { undoLast(chatId); return; }

  // Clasificar con Claude
  let obj;
  try {
    obj = classify(text);
  } catch (err) {
    tgSend(chatId, '⚠️ No pude interpretarlo (' + err + ').\nProbá de nuevo, ej: "uber 8500" o "cobré sueldo 2400000".');
    return;
  }
  obj = sanitize(obj);
  obj._hora = Utilities.formatDate(new Date(msg.date * 1000), 'America/Argentina/Buenos_Aires', 'HH:mm');

  // Guardar pendiente (10 min) y pedir confirmación con botones
  CacheService.getScriptCache().put('p_' + chatId, JSON.stringify(obj), 600);
  tgSendKeyboard(chatId, resumen(obj), [
    [{ text: 'Guardar', callback_data: 'save' },
     { text: 'Corregir', callback_data: 'edit' },
     { text: 'Cancelar', callback_data: 'cancel' }]
  ]);
}

// ===================================================================
// BOTONES (callback)
// ===================================================================
function handleCallback(cq) {
  const chatId = String(cq.message.chat.id);
  const msgId = cq.message.message_id;
  const action = cq.data;
  const cache = CacheService.getScriptCache();
  const raw = cache.get('p_' + chatId);

  if (action === 'cancel') {
    cache.remove('p_' + chatId);
    tgAnswer(cq.id, 'Cancelado');
    tgEdit(chatId, msgId, 'Cancelado. No se guardó nada.');
    return;
  }
  if (action === 'edit') {
    cache.remove('p_' + chatId);
    tgAnswer(cq.id, 'Reescribí el dato');
    tgEdit(chatId, msgId, 'Dale, reescribí el movimiento completo (con monto y, si querés, medio de pago).');
    return;
  }
  if (action === 'save') {
    if (!raw) { tgAnswer(cq.id, 'Expiró'); tgEdit(chatId, msgId, 'Pasaron más de 10 min. Reenvialo, porfa.'); return; }
    const obj = JSON.parse(raw);
    let id;
    try { id = saveRow(obj); }
    catch (err) { tgAnswer(cq.id, 'Error'); tgEdit(chatId, msgId, 'Error al guardar: ' + err); return; }
    cache.remove('p_' + chatId);
    tgAnswer(cq.id, 'Guardado');
    tgEdit(chatId, msgId, resumen(obj) + '\n\n— Registrado · ID ' + id);
  }
}

// ===================================================================
// CLAUDE — clasificación a JSON
// ===================================================================
function classify(text) {
  const system =
'Sos un clasificador de finanzas personales en Argentina. Devolvés EXCLUSIVAMENTE un objeto JSON válido, ' +
'sin markdown, sin backticks, sin texto antes ni después.\n\n' +
'Campos exactos:\n' +
'{"tipo","categoria","subcategoria","concepto","contraparte","monto","divisa","medio_pago","cuota_n","cuota_tot","reintegrable","descripcion"}\n\n' +
'Reglas:\n' +
'- "tipo": "Ingreso" si el texto habla de cobrar/ingresar/recibir/sueldo/reintegro; si no, "Egreso".\n' +
'- "categoria": ELEGÍ UNA EXACTA de estas listas (respetá tildes y mayúsculas).\n' +
'    Si es Egreso: ' + CATS_EGRESO.join(', ') + '.\n' +
'    Si es Ingreso: ' + CATS_INGRESO.join(', ') + '.\n' +
'    Si dudás, usá "Otros".\n' +
'- "medio_pago": ELEGÍ UNO EXACTO de: ' + MEDIOS.join(', ') + '.\n' +
'    Si el texto no aclara el medio, usá "' + DEFAULT_MEDIO + '". "visa"→"Santander - TC Visa", ' +
'"débito"→"Santander - Débito", "mercado pago"/"mp"→"Mercado Pago - Saldo", "efectivo"/"cash"→"Efectivo", ' +
'"dólares en el banco"→"Santander - Caja Ahorro USD".\n' +
'- "monto": número entero sin separadores. "12.500"→12500, "12,5k"→12500, "1.250.000"→1250000.\n' +
'- "divisa": "USD" si menciona usd/u$s/dólares; si no "ARS".\n' +
'- "cuota_n"/"cuota_tot": números si dice "en N cuotas" (ej "en 3 cuotas"→cuota_n=1,cuota_tot=3); si no, null.\n' +
'- "reintegrable": "Si" si lo paga/comparte alguien más (ej "lo divido con", "me lo devuelve"), si no "No".\n' +
'- "concepto": el comercio o concepto corto. "contraparte": persona/empresa si aplica, si no "".\n' +
'- "descripcion": "".\n\n' +
'Ejemplos:\n' +
'IN: "mcdonalds 12500 con visa" OUT: {"tipo":"Egreso","categoria":"Comida","subcategoria":"Fast food","concepto":"McDonald\'s","contraparte":"McDonald\'s","monto":12500,"divisa":"ARS","medio_pago":"Santander - TC Visa","cuota_n":null,"cuota_tot":null,"reintegrable":"No","descripcion":""}\n' +
'IN: "cobré sueldo 2418419" OUT: {"tipo":"Ingreso","categoria":"Sueldo","subcategoria":"Sueldo","concepto":"Sueldo CTA","contraparte":"Yopdev","monto":2418419,"divisa":"ARS","medio_pago":"Santander - Caja Ahorro ARS","cuota_n":null,"cuota_tot":null,"reintegrable":"No","descripcion":""}\n' +
'IN: "nafta 64000" OUT: {"tipo":"Egreso","categoria":"Vehículo","subcategoria":"Combustible","concepto":"Nafta","contraparte":"","monto":64000,"divisa":"ARS","medio_pago":"Santander - TC Visa","cuota_n":null,"cuota_tot":null,"reintegrable":"Si","descripcion":""}\n' +
'IN: "auriculares 90000 en 3 cuotas mercado pago" OUT: {"tipo":"Egreso","categoria":"Crédito/Cuotas","subcategoria":"Tecnología","concepto":"Auriculares","contraparte":"","monto":90000,"divisa":"ARS","medio_pago":"Mercado Pago - Saldo","cuota_n":1,"cuota_tot":3,"reintegrable":"No","descripcion":""}';

  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      system: system,
      messages: [{ role: 'user', content: text }]
    })
  });
  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code !== 200) throw new Error('API ' + code + ': ' + body.slice(0, 140));
  const data = JSON.parse(body);
  let out = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  out = out.replace(/```json/gi, '').replace(/```/g, '').trim();
  const s = out.indexOf('{'), eIdx = out.lastIndexOf('}');
  if (s < 0 || eIdx < 0) throw new Error('sin JSON');
  return JSON.parse(out.slice(s, eIdx + 1));
}

// Parseo robusto de montos (formato argentino: puntos=miles, coma=decimal)
function parseMonto(v) {
  if (typeof v === 'number') return Math.abs(v);
  let s = String(v).replace(/[^0-9.,-]/g, '');
  if (s.indexOf(',') >= 0) { s = s.replace(/\./g, '').replace(',', '.'); }
  else if (s.indexOf('.') >= 0) {
    const parts = s.split('.');
    if (parts.slice(1).every(p => p.length === 3)) s = parts.join(''); // 12.500 / 1.250.000 → miles
  }
  return Math.abs(parseFloat(s) || 0);
}

// Forzar valores a los catálogos cerrados
function sanitize(o) {
  o.tipo = (String(o.tipo).toLowerCase().indexOf('ingreso') >= 0) ? 'Ingreso' : 'Egreso';
  const lista = o.tipo === 'Ingreso' ? CATS_INGRESO : CATS_EGRESO;
  if (lista.indexOf(o.categoria) < 0) o.categoria = 'Otros';
  if (MEDIOS.indexOf(o.medio_pago) < 0) o.medio_pago = DEFAULT_MEDIO;
  o.divisa = (String(o.divisa).toUpperCase() === 'USD') ? 'USD' : 'ARS';
  o.monto = parseMonto(o.monto);
  o.reintegrable = (String(o.reintegrable).toLowerCase().charAt(0) === 's') ? 'Si' : 'No';
  o.concepto = o.concepto || '(sin concepto)';
  o.contraparte = o.contraparte || '';
  o.subcategoria = o.subcategoria || '';
  return o;
}

// ===================================================================
// GOOGLE SHEETS
// ===================================================================
function getSheet() {
  const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('No existe la hoja "' + SHEET_NAME + '"');
  return sh;
}
function nextId(sh) {
  const last = sh.getLastRow();
  let max = 0;
  if (last > 1) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    ids.forEach(r => {
      const m = String(r[0]).match(/(\d+)\s*$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
  }
  return ID_PREFIX + '-' + String(max + 1).padStart(4, '0');
}
function saveRow(o) {
  const sh = getSheet();
  const id = nextId(sh);
  const now = new Date();
  const fecha = Utilities.formatDate(now, 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy');
  const hora = o._hora || Utilities.formatDate(now, 'America/Argentina/Buenos_Aires', 'HH:mm');
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const mes = meses[now.getMonth()];

  // Mapear a las 18 columnas EN ORDEN
  const row = [
    id, fecha, hora, mes, o.tipo, o.categoria, o.subcategoria, o.concepto, o.contraparte,
    o.monto, o.divisa, o.medio_pago,
    (o.cuota_n != null ? o.cuota_n : ''), (o.cuota_tot != null ? o.cuota_tot : ''),
    o.reintegrable, '', 'Pendiente', o.descripcion || ''
  ];
  sh.appendRow(row);
  P.setProperty('LAST_ROW', String(sh.getLastRow())); // para /deshacer
  return id;
}
function undoLast(chatId) {
  const lastRow = parseInt(P.getProperty('LAST_ROW') || '0', 10);
  const sh = getSheet();
  if (!lastRow || lastRow > sh.getLastRow() || lastRow < 2) { tgSend(chatId, 'No hay nada reciente para deshacer.'); return; }
  const id = sh.getRange(lastRow, 1).getValue();
  sh.deleteRow(lastRow);
  P.deleteProperty('LAST_ROW');
  tgSend(chatId, '🗑️ Borré el último registro (ID ' + id + ').');
}

// ===================================================================
// FORMATO
// ===================================================================
function nf(n) { return Number(n).toLocaleString('es-AR'); }
function resumen(o) {
  const sign = o.tipo === 'Egreso' ? '−' : '+';
  let t = o.tipo + ' · ' + sign + '$' + nf(o.monto) + ' ' + o.divisa + '\n';
  t += o.categoria + (o.subcategoria ? ' · ' + o.subcategoria : '') + '\n';
  t += o.concepto + (o.contraparte && o.contraparte !== o.concepto ? '  (' + o.contraparte + ')' : '') + '\n';
  t += o.medio_pago;
  if (o.cuota_tot) t += '\nCuota ' + (o.cuota_n || 1) + '/' + o.cuota_tot;
  if (o.reintegrable === 'Si') t += '\nReintegrable: sí';
  return t;
}
function msgStart() {
  return 'ContaBot. Mandame un gasto o ingreso en texto y lo registro.\n\n' +
    'Ejemplos:\n• mcdonalds 12500 con visa\n• uber 8500\n• cobré sueldo 2418419\n• nafta 64000\n• auriculares 90000 en 3 cuotas mercado pago\n\n' +
    'Te muestro un resumen y confirmás antes de guardar.\n\nComandos: /ayuda · /deshacer';
}
function msgHelp() {
  return 'Cómo funciona:\n1) Escribís el movimiento.\n2) Lo interpreto y te muestro el resumen.\n3) Tocás Guardar / Corregir / Cancelar.\n\n' +
    'Medios: visa, débito, amex, mercado pago, efectivo, dólares.\n' +
    'Cuotas: "en 3 cuotas".  Reintegrable: "lo divido con...".\n\n' +
    'Categorías de gasto:\n' + CATS_EGRESO.join(' · ') + '\n\n/deshacer borra el último registro.';
}

// ===================================================================
// TELEGRAM API
// ===================================================================
function tgApi(method, payload) {
  UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/' + method, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  });
}
function tgSend(chatId, text) { tgApi('sendMessage', { chat_id: chatId, text: text }); }
function tgSendKeyboard(chatId, text, kb) {
  tgApi('sendMessage', { chat_id: chatId, text: text, reply_markup: { inline_keyboard: kb } });
}
function tgEdit(chatId, msgId, text) {
  tgApi('editMessageText', { chat_id: chatId, message_id: msgId, text: text });
}
function tgAnswer(cbId, text) { tgApi('answerCallbackQuery', { callback_query_id: cbId, text: text }); }

// ===================================================================
// UTILIDADES DE SETUP (correr a mano una vez)
// ===================================================================
function setupProperties() {
  // Completá y corré UNA vez. Después borrá los valores de acá por seguridad.
  P.setProperties({
    TELEGRAM_TOKEN: 'PEGAR_TOKEN_BOTFATHER',
    ANTHROPIC_KEY: 'sk-ant-PEGAR',
    SHEET_ID: 'PEGAR_SHEET_ID',
    SHEET_NAME: 'Registro 2026',
    ALLOWED_CHAT_ID: '' // dejá vacío al principio; completalo con tu chatId
  });
  Logger.log('Propiedades guardadas.');
}
function setWebhook() {
  // Corré DESPUÉS de implementar como app web. Pega tu URL /exec acá:
  const URL = 'PEGAR_TU_URL_/exec';
  const r = UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/setWebhook?url=' + encodeURIComponent(URL));
  Logger.log(r.getContentText());
}
function getWebhookInfo() {
  Logger.log(UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/getWebhookInfo').getContentText());
}
function test() {
  // Valida Sheet + Claude sin Telegram.
  Logger.log('Sheet OK: fila siguiente = ' + nextId(getSheet()));
  const o = sanitize(classify('mcdonalds 12500 con visa'));
  Logger.log('Claude OK: ' + JSON.stringify(o));
  Logger.log('Resumen:\n' + resumen(o));
}
