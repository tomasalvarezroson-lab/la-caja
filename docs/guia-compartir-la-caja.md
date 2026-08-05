# Cómo armé mi sistema de control financiero con Claude

Esta es una guía genérica de cómo organicé mis finanzas personales con ayuda de Claude
(Claude Code + Claude API), pensada para compartir el *cómo* sin exponer datos reales.
Todos los montos, nombres y ejemplos de este documento son **ficticios**.

---

## 1. La idea general

Tres piezas que se hablan entre sí:

1. **Un bot de Telegram** para cargar cada gasto/ingreso en texto natural, sin fricción.
2. **Una IA (Claude)** que clasifica ese texto en categoría, monto, medio de pago, etc.
3. **Un dashboard propio** (una página web simple) que lee esos datos y los muestra en
   gráficos, KPIs y una tabla filtrable.

Todo corre sobre herramientas gratuitas o casi gratuitas: Google Sheets como base de
datos, Google Apps Script como "backend", GitHub Pages para publicar el dashboard, y la
API de Claude para clasificar.

```
Telegram  →  Google Apps Script  →  Claude API  →  Google Sheets
                                                        │
                                                        ▼
                                        CSV exportado a mano
                                                        │
                                                        ▼
                                   script Python (CSV → JSON)
                                                        │
                                                        ▼
                                Dashboard estático (HTML/JS) — GitHub Pages
```

---

## 2. Cargar un movimiento (el bot de Telegram)

Le escribo al bot como le escribiría a una persona:

```
uber 8500
super coto 35000 transferencia
nafta 64000 debito
mcdonalds 12500 en 3 cuotas credito
```

El bot le pasa ese texto a Claude con un prompt que sabe:
- las categorías cerradas que uso (Comida, Transporte, Servicios, Salud, etc.),
- cómo mapear jerga a medios de pago concretos ("crédito" → tarjeta de crédito X,
  "transferencia" → cuenta bancaria Y, etc.),
- reglas puntuales aprendidas de casos mal clasificados (ej: la palabra "ahorro" suelta
  no debe interpretarse como categoría de ahorro si no hay contexto).

En menos de un minuto el bot responde con el resumen clasificado y tres botones:
**Guardar / Corregir / Cancelar**. Si toco "Guardar", se escribe una fila nueva en el
Google Sheet con un ID único y estado `Pendiente`.

**Por qué polling y no webhook:** al principio el bot usaba webhook (Telegram empuja el
mensaje al script). Google Apps Script respondía de forma intermitente con un redirect
que Telegram no sabe seguir, y esto generaba reintentos y mensajes duplicados. La
solución fue invertir el flujo: el script le *pregunta* a Telegram cada 1 minuto
("¿hay mensajes nuevos?") en vez de esperar que Telegram le avise. Encareció la latencia
un poco (hasta 60 seg de respuesta) pero eliminó los duplicados por completo. Este tipo
de decisión — encontrada charlando el problema con Claude — es un buen ejemplo de que la
parte más valiosa no fue "que la IA escriba código", sino tener alguien con quien pensar
la arquitectura.

---

## 3. La planilla (Google Sheet) como base de datos

Cada fila es un movimiento, con columnas fijas. Versión genérica del esquema:

| Columna | Ejemplo | Notas |
|---|---|---|
| ID | `26-0101` | correlativo, año + número |
| Fecha | `2026-03-15` | ISO |
| Hora | `14:32` | capturada del mensaje de Telegram |
| Mes | `Marzo` | derivado de la fecha |
| Tipo | `Egreso` / `Ingreso` | |
| Categoría | `Comida` | de una lista cerrada |
| Concepto | `Almuerzo` | texto libre |
| Contraparte | `Restaurant genérico` | a quién le pagué / quién me pagó |
| Monto | `12500` | siempre positivo |
| Divisa | `ARS` / `USD` | todo se normaliza a una sola moneda |
| Medio de pago | `Tarjeta de crédito` | |
| Cuota N / Cuota total | `2 / 6` | si aplica |
| Reintegro esperado | `Sí` / `No` | |
| Estado | `Pendiente` / `Conciliado` | ver sección 5 |
| Fuente | `bot` / `banco` / `manual` | de dónde vino el dato |

Algunas decisiones de diseño (documentadas aparte, para no tener que recordarlas cada
vez que retomo el proyecto):
- Ciertas categorías especiales (por ejemplo, pagos a una deuda personal, o compra de
  moneda extranjera como ahorro) se **excluyen** de los cálculos de "gasto de consumo" —
  no son consumo, son movimiento de capital.
- Categorías que son en realidad ingresos que ya se gastaron o que hay que devolver
  (reintegros, préstamos recibidos) se excluyen del KPI de "Ingresos".
- Si un gasto se comparte con otra persona en un porcentaje fijo, se carga ya
  prorrateado — el dashboard no hace ese cálculo.

---

## 4. Conciliación contra el resumen bancario

Una vez al mes (o cuando junto varios resúmenes), comparo lo que cargué en el Sheet
contra los movimientos reales de las cuentas/tarjetas:

1. Descargo el resumen de cada cuenta/tarjeta del período.
2. Reviso movimiento por movimiento contra lo cargado, buscando por fecha + monto.
3. Lo que coincide pasa de estado `Pendiente` a `Conciliado`.
4. Lo que está en el resumen y no en el Sheet, lo cargo manualmente (fuente `banco`).
5. Lo que está en el Sheet y no aparece en el resumen, lo reviso — puede ser un cargo
   que todavía no impactó, o un error de carga.

Hoy este paso es manual (leer el PDF/resumen y comparar a ojo, con Claude ayudando a
tipear o revisar montos). El campo `ref_banco` en el esquema quedó preparado para el
día que valga la pena automatizar el matcheo contra un PDF exportado.

---

## 5. Del Sheet al dashboard

El dashboard es una página estática (HTML + JS + Chart.js), sin backend ni build. No
lee el Sheet en vivo — lee un archivo `data.json` que se regenera a mano:

1. Exporto la pestaña del Sheet como CSV.
2. Corro un script Python que convierte ese CSV al `data.json` que consume el dashboard
   (normaliza fechas, calcula campos derivados, valida esquema).
3. Subo ese `data.json` al repo — como el dashboard está en GitHub Pages, se actualiza
   solo.

Es un paso manual a propósito: mantiene el sistema simple (nada de credenciales de
Google Sheets API corriendo en un servidor) a cambio de no tener datos en tiempo real.
Para el uso que le doy (revisar 1-2 veces por semana) es un trade-off que vale la pena.

---

## 6. El dashboard

Estructura de la página (con datos ficticios en las capturas mentales, no reales):

- **Barra de KPIs arriba:** ingresos del período, gasto de consumo, algún indicador de
  ahorro/deuda si aplica, tasa de ahorro.
- **Filtros:** por año, tipo (ingreso/egreso), mes (multi-selección), categoría, medio
  de pago, rango de fechas.
- **Gráfico de barras:** evolución mensual de ingresos vs egresos.
- **Donut:** egresos por categoría (solo categorías de "consumo real", las excluidas del
  punto 3 no entran acá).
- **Gráfico evolutivo:** tendencia a lo largo del año.
- **Tabla de movimientos:** buscable por texto libre, exportable a CSV.
- **Panel de "insights":** un resumen automático de cambios relevantes vs. la carga
  anterior (ej: "el gasto en tal categoría subió/bajó respecto al mes pasado").
- **Carga manual:** un botón para subir una planilla `.xlsx` y ver los datos sin pasar
  por el proceso de publicar `data.json` (para explorar rápido).

Ejemplo de fila de datos (100% ficticia, solo para mostrar la forma):

```json
{
  "id": "26-0042",
  "fecha": "2026-04-10",
  "mes": "Abril",
  "tipo": "Egreso",
  "cat": "Comida",
  "concepto": "Supermercado",
  "contraparte": "Almacén genérico",
  "monto": 15300,
  "divisa": "ARS",
  "medio": "Tarjeta de débito",
  "estado": "Conciliado"
}
```

---

## 7. Qué necesitás si querés armar algo parecido

- Una cuenta de Google (Sheets + Apps Script, gratis).
- Un bot de Telegram creado con `@BotFather` (gratis, 2 minutos).
- Una API key de Anthropic (Claude) — se paga por uso, pero clasificar mensajes cortos
  con un modelo chico es centavos por mes.
- Un lugar gratuito para publicar el dashboard (GitHub Pages funciona bien si no
  necesitás que sea privado; si sí, se le puede poner una contraseña simple en el
  frontend).
- Ganas de iterar: la clasificación de la IA mejora a medida que le corregís casos mal
  categorizados y ajustás el prompt.

Lo más valioso del proceso no fue tanto "la IA escribe el código" sino usar a Claude
como compañero de diseño: pensar juntos la arquitectura (por qué polling y no webhook),
decidir qué se automatiza y qué se deja manual a propósito, y documentar las decisiones
para no tener que redescubrirlas cada vez que vuelvo al proyecto después de un tiempo.
