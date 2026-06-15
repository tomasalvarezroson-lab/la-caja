# la-caja-bot — Contexto operativo

> Estado al 14/06/2026. Documento de referencia sobre cómo opera el bot de registro de gastos del Proyecto Independizarme. Reemplaza la documentación previa de "ContaBot".

---

## 1. Identidad

| Campo | Valor |
|-------|-------|
| Nombre del proyecto | **la-caja-bot** (antes "ContaBot") |
| Handle de Telegram | `@Toto_conta_bot` (sin cambios) |
| Propósito | Registrar gastos/ingresos por texto natural, clasificarlos con IA y guardarlos en Google Sheets |
| Rol en el proyecto | Capa de entrada de datos del sistema "La Caja". Alimenta el Sheet que después consume el dashboard y el análisis del coach |

El bot es **infraestructura auxiliar** del Proyecto Independizarme (mudanza oct/nov 2026). No es un fin en sí mismo: existe para que registrar cada gasto tenga fricción mínima y los datos lleguen limpios al análisis mensual.

---

## 2. Arquitectura actual — POLLING (no webhook)

```
Telegram  ←(getUpdates cada 1 min)──►  Apps Script  ───►  Claude API (haiku)  ───►  Google Sheets
```

**Decisión clave: el bot usa POLLING, no webhook.**

### Por qué polling y no webhook

Apps Script como webhook de Telegram es inestable: de forma intermitente Google responde a los POST de Telegram con un redirect **`302 Moved Temporarily`** (hacia `script.googleusercontent.com`). Telegram no sigue redirects en webhooks, lo lee como fallo y **reintenta el mismo update decenas de veces**. Resultado: mensajes duplicados, registros repetidos en el Sheet, y comportamiento errático imposible de corregir desde el código del script.

El 302 es intermitente y NO se puede arreglar desde Apps Script — es comportamiento de la infraestructura de Google. Un mensaje caía en el camino directo (funcionaba), el siguiente caía en el redirect (fallaba).

**El polling elimina el problema de raíz:** en vez de que Telegram empuje mensajes al script (y dependa de que Google responda bien a un POST externo), el script consulta a Telegram cada minuto con `getUpdates`. No hay POST entrante, no hay 302, no hay reintentos, no hay duplicados.

### Cómo funciona el polling

- Un **trigger de tiempo** corre `pollUpdates()` cada 1 minuto.
- `pollUpdates` consulta `getUpdates` con un `offset` guardado en ScriptProperties (`TG_OFFSET`).
- El offset garantiza que cada update se procesa **una sola vez** (no hace falta deduplicación por update_id).
- Procesa todos los updates nuevos en lote (mensajes y botones), guarda el nuevo offset.
- Un `LockService` evita que dos polls corran en paralelo.

### Costo del polling (trade-off aceptado)

- **Delay de hasta 60 segundos** entre que mandás el gasto y el bot responde. Tolerable para registrar gastos (no se necesita respuesta instantánea).
- El bot **no depende de ninguna implementación como app web**. Si en el futuro hay comportamiento raro, NO buscar en las implementaciones `/exec` — esas quedaron de la época del webhook y ya no se usan.

---

## 3. Componentes y dónde vive cada uno

| Componente | Ubicación | Notas |
|------------|-----------|-------|
| Código del bot | Proyecto Apps Script (cuenta Google de Toto) | Fuente de verdad para EJECUCIÓN |
| Backup del código | `la-caja/scripts/ContaBot.gs` (repo local + GitHub) | Solo versionado; el `.gs` en GitHub NO se ejecuta |
| Base de datos | Google Sheet, pestaña `Registro 2026` | Sheet ID en ScriptProperties |
| Clasificador IA | Claude API, modelo `claude-haiku-4-5-20251001` | Rápido y barato |
| Dashboard | `la-caja` (GitHub Pages) | Consume el CSV exportado del Sheet |

### Propiedades del script (ScriptProperties)

Cargadas en Apps Script → Configuración → Propiedades del script. **Nunca van hardcodeadas en el código ni se suben al repo:**

- `TELEGRAM_TOKEN` → token de @BotFather
- `ANTHROPIC_KEY` → API key de Anthropic (sk-ant-...)
- `SHEET_ID` → `10n7OGs5Pu7F4_mQr-Pe7LESH6kFsV-tQrs25w_s7fQw`
- `SHEET_NAME` → `Registro 2026`
- `ALLOWED_CHAT_ID` → `941458093` (solo Toto puede usar el bot)
- `TG_OFFSET` → gestionado automáticamente por el polling (no tocar a mano)
- `LAST_ROW` → gestionado automáticamente (para /deshacer)

---

## 4. Vocabulario de clasificación

### Medios de pago — mapeo del lenguaje natural de Toto

| Lo que escribís | Se guarda como |
|-----------------|----------------|
| crédito / credito | Santander - TC Visa |
| débito / debito | Santander - Débito |
| efectivo / cash | Efectivo |
| transferencia / transf | Santander - Caja Ahorro ARS |
| mercado pago / mp | Mercado Pago - Saldo |
| **(sin aclarar)** | **Santander - Débito** — default |

Las tildes son opcionales: "credito" y "crédito" mapean igual.

**Default = Débito** por decisión estratégica del proyecto: en fase de Deuda Cero, el débito conecta el gasto con dinero real en el momento (refuerza topes y regla de 48h), mientras el crédito difiere el dolor y sabotea la fricción. El crédito queda para gastos declarados explícitamente.

### Reglas especiales aprendidas (correcciones aplicadas al prompt)

- **"ahorro" NO es medio de pago ni categoría.** Si aparece suelto, se ignora para el medio (usa default) y NO se interpreta como categoría "Ahorro USD". (Antes clasificaba mal "Didi 16070 ahorro" → Ahorro USD.)
- **"ahorro" NO implica USD.** La divisa es USD solo si se menciona dólares/usd/u$s explícitamente.
- **"crédito" como medio NO dispara cuotas.** Las cuotas solo se registran si el texto dice "en N cuotas".

### Categorías cerradas

**Egreso:** Comida, Supermercado, Transporte, Vehículo, Servicios, Salud, Educación, Entradas/Eventos, Regalos, Ropa, Actividades, Crédito/Cuotas, Gastos importantes, Deuda Marie, Ahorro USD, Otros

**Ingreso:** Sueldo, Bono/Extra, Reintegro, Préstamo recibido, Otros

---

## 5. Operación diaria

1. Mandás un gasto en texto natural al bot, ej:
   - `mcdonalds 12500 credito`
   - `uber 8500`
   - `super coto 35000 transferencia`
   - `nafta 64000 debito`
2. En hasta ~60 seg el bot responde con un resumen y tres botones: **Guardar / Corregir / Cancelar**.
3. Tocás **Guardar** → se escribe la fila en el Sheet con un ID `26-XXXX` y estado `Pendiente`.

### Reglas de uso

- **Confirmá dentro de 10 minutos.** El gasto queda en caché con TTL de 10 min. Si tocás "Guardar" después, expira y hay que reenviarlo. (TTL configurable en el código: línea `put('p_' + chatId, ..., 600)`.)
- **Comando `/deshacer`** borra el último registro guardado.
- **Comandos `/start` y `/ayuda`** muestran ejemplos y el vocabulario.

---

## 6. Mantenimiento

### Reactivar el polling (si se desactiva el trigger)

Ejecutar **una vez** la función `setupPolling()` desde el editor de Apps Script. Esa función:
- borra triggers viejos,
- desconecta cualquier webhook residual,
- crea el trigger de `pollUpdates` cada 1 minuto.

### Validar Sheet + Claude sin pasar por Telegram

Ejecutar `test()` desde el editor. Loguea el próximo ID, la clasificación de un caso de prueba y el resumen.

### Troubleshooting

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| El bot no responde | Trigger de polling caído | Ejecutar `setupPolling()` |
| Mensajes duplicados | Volvió a quedar un webhook activo | Ejecutar `setupPolling()` (desconecta webhook) |
| Responde un gasto viejo | Caché de transacción pendiente sin confirmar | Confirmá o cancelá antes de mandar otro |
| Clasifica mal un caso nuevo | Falta regla en el prompt | Anotar el caso y ajustar la función `classify` |
| Error 401 | (Solo aplica si se vuelve a webhook) Implementación con "Ejecutar como cuenta de Google" | No usar webhook; usar polling |

### Regla de oro

**El bot NO depende de ninguna implementación como app web.** Las URLs `/exec` que quedaron de la época del webhook son inertes. No reactivarlas para Telegram — vuelve el 302.

---

## 7. Sincronización código → repo

El editor de Apps Script es la fuente de verdad de ejecución. El repo es backup/historial.

```bash
cd /Users/tomas/Desktop/Toto/Finanzas/la-caja
# copiar el código actual de Apps Script a scripts/ContaBot.gs
git add scripts/ContaBot.gs
git commit -m "la-caja-bot: descripción del cambio"
git push
```

Cuando edites el bot, hacelo en Apps Script y después sincronizá al repo a mano. (Más adelante se puede automatizar con `clasp`.)

---

## 8. Pendientes / roadmap

- **Afinar clasificación** sobre la marcha: cuando un caso real se clasifique mal, anotarlo y ajustar el prompt en una pasada.
- **Automatización Sheet → dashboard:** hoy actualizar el dashboard requiere exportar CSV a mano y correr `update_data.py`. Pendiente automatizar.
- **Comandos del roadmap original** (se activan solo cuando el dolor lo justifique):
  - `/cierre_mensual` → resumen pegable para el análisis con el coach
  - Alertas por umbral (regalos > $60k, salidas > $80k)
  - Recordatorio mensual de transferencia a Marie
  - `/estado` → deuda Marie, pozo mudanza, % avance de fase

---

## 9. Conexión con el proyecto

El bot existe para cerrar el loop **registro → análisis → decisión**. Con el bot estable y el histórico cargado (423 movimientos base), el siguiente paso del proyecto es el **cierre mensual**: traer los números reales de junio (con el bono confirmado) y hacer el análisis contra las 3 fases (Deuda Cero → Pozo Mudanza → Ejecución).
