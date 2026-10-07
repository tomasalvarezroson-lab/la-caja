# Decisiones de datos — La Caja

Notas para quien (humano o Claude Code) edite `app.js` o `update_data.py` sin
contexto de las sesiones donde se armó el dataset.

## Categorías que NO son consumo

`Deuda Marie` y `Ahorro USD` se excluyen de:
- Donut "Egresos por categoría · consumo"
- KPI "Gastos de consumo"

Se usan para:
- KPI "Deuda Marie pagada" / "Compra de dólares"
- Tasa de ahorro = (Deuda Marie + Ahorro USD) / Ingresos

Si se agregan categorías nuevas de este tipo, actualizar `NO_CONSUMO` en `app.js`.

## Vehículo al 50% (regla vigente hasta 2026-08-15)

Los registros de `Vehículo` cargados **hasta el 2026-08-15** (nafta, peajes,
seguro, patente, parking, etc.) están cargados ya con el monto al 50% —
Marie paga la otra mitad de TODO lo relacionado al auto. Esto se aplicó
directo en los datos, no es un cálculo del dashboard.

**Cambio de convención desde el 2026-08-15:** a partir de esta fecha, los
gastos de `Vehículo` se cargan por el **monto total** pagado (`reint: "Si"`
para marcar que corresponde reintegro). Cuando Marie efectivamente devuelve
su mitad, ese reintegro se carga como un movimiento de `Ingreso` aparte —
no se resta ni se anticipa en el momento de cargar el gasto. No dividir el
monto a la mitad al cargar el gasto original.

El bot (ContaBot) no aplica ninguna de estas reglas automáticamente — hay
que cargar el monto correcto a mano (total, no dividido) y, más adelante,
el ingreso del reintegro de Marie cuando corresponda.

## Ingresos excluidos del KPI "Ingresos"

`Reintegro` y `Préstamo recibido` se excluyen del KPI "Ingresos" (no son
ingreso real, son entradas de plata que ya salió o que hay que devolver).
Ver `NO_ING` en `app.js`.

## USD → ARS

Todo el dataset está en ARS. Conversión usada: **$1.420 por USD** (tipo de
cambio de referencia al momento de la carga, Ene-Jun 2026). Si se carga un
movimiento nuevo en USD, pesificar a ese valor para mantener consistencia
histórica, o documentar el tipo de cambio usado si cambia.

## Pagos a Deuda Marie confirmados (histórico)

| Mes | USD | ARS @1420 |
|---|---|---|
| Enero (19/01) | 1.000 | 1.420.000 |
| Febrero (17/02) | 125 | 177.500 |
| Marzo (05/03) | 200 | 284.000 |

Saldo deuda a fin de marzo: ~USD 1.000 (según Proyecto_Independizarme.txt,
capacidad de pago USD 200/mes).

## El dashboard NO esconde plata (regla de oro, 07/10/2026)

El propósito del tablero es simple: **cuánto entró, cuánto gasté, en qué
gasté**. Ninguna tarjeta ni gráfico debe excluir del total un movimiento
real porque sea "extraordinario", "one-off" o "no operativo". Si un mes se
ve raro por un gasto o ingreso puntual, eso es información, no un problema
a corregir en el cálculo.

**Por qué está escrito acá:** en el cierre de septiembre 2026 se agregó una
lógica que sacaba del KPI de Ingresos el regalo de mudanza de Marie
($4.300.000) y del KPI de Gastos todo el bloque de mudanza ($4,1M). El
resultado fue que agosto perdía su ingreso más grande y septiembre su gasto
más grande, y el tablero dejaba de servir para lo que se hizo. Se revirtió.

**Cómo aplicarlo:** antes de agregar cualquier exclusión a `agg()`,
`renderDonut()`, `renderAlerts()` o `snapshot()` en `app.js`, preguntarse si
esconde plata que realmente se movió. Si la respuesta es sí, no va: mostrar
el número completo y, si hace falta contexto, agregarlo como dato visible
al lado (un hint, una tarjeta más), nunca restándolo del total.

Las únicas exclusiones vigentes, todas con la plata visible en otra tarjeta
o por ser otra moneda:

| Qué | Dónde no entra | Por qué |
|---|---|---|
| `Deuda Marie`, `Ahorro USD` (egresos) | KPI "Gastos de consumo", donut | Tienen tarjeta propia ("Deuda Marie pagada" / "Compra de dólares") |
| `Reintegro`, `Préstamo recibido` (ingresos) | KPI "Ingresos" | Se muestran como hint abajo de Ingresos ("+ $X de reintegros"). No suman porque el gasto que los originó ya está contado completo |
| `Ahorro USD` tipo Ingreso | todo | Son la contrapartida **en USD** de una compra de dólares (`divisa: USD`), no pesos que entraron |

## Campo `bloque` (etiqueta informativa, no afecta ningún cálculo)

Las filas desde septiembre 2026 traen `bloque` (`Recurrente` /
`Mudanza (one-off)` / `Ingreso` / `Reintegro`), heredado del cierre mensual.
Sirve para poder responder "¿cuánto de esto fue la mudanza?" consultando el
dato, y nada más: **`app.js` no lo lee**. Si algún día se quiere usar, que
sea para agregar una vista nueva, no para restar de los totales existentes
(ver regla de oro arriba).

## Categorías Vivienda y Mudanza (desde sept. 2026)

- `Vivienda`: alquiler, expensas, internet/cable, seguro del hogar.
- `Mudanza`: gasto puntual de ingreso al depto que no entra en otra
  categoría de consumo normal (depósito, muebles, ferretería/hogar,
  cortinas, flete). Las compras grandes de supermercado para el stock
  inicial quedan con `cat=Supermercado` + `bloque=Mudanza (one-off)` (ver
  sección anterior) en vez de `cat=Mudanza`, para no inflar "Mudanza" con
  algo que en los hechos es súper.

## % Seguridad (desde sept. 2026)

Campo nuevo, no usado todavía por el dashboard (no hay tab "Datos"):
confianza de la categorización/import de cada fila. `< 70` → descripción
con `[REVISAR xx%]`; `< 60` → `estado = "Pendiente"`. Nunca se asigna una
categoría con alta seguridad a algo que no se pudo identificar.

## Deuda técnica conocida en los datos (auditoría 07/10/2026)

Cosas que hacen que el tablero subestime o distorsione el gasto. No están
arregladas; si se arreglan, actualizar esta lista.

1. **Suscripciones de junio y julio cargadas en USD sin pesificar.** 15
   filas (`26-0470`..`26-0531`) tienen `divisa: "USD"` y montos como `20` o
   `9.99`. El dashboard las suma como si fueran pesos, así que `Servicios`
   de junio está ~$95.000 abajo y julio ~$85.000 abajo. Desde agosto las
   suscripciones se cargan ya pesificadas (agosto @1.515, septiembre
   @1.530), así que el problema es solo de esos dos meses.
2. **Cuotas de tarjeta: solo se cargó la primera cuota de cada compra.**
   Jun/jul/ago tienen $0 en `Crédito/Cuotas` y septiembre $139.123 (4
   cuotas tomadas del resumen). No es un gasto nuevo de septiembre: existía
   antes y no estaba cargado. La comparación mes a mes de esa categoría no
   sirve hasta que se complete el histórico.
3. **`Vehículo` cambia de criterio a mitad de año.** Ene–jun está cargado
   al 50% (Marie pagaba la mitad en el momento); desde el 15/08 se carga el
   100% y el reintegro entra aparte. La serie no es comparable en el corte.
4. **Posible duplicado sin resolver:** `26-0614` y `26-0591`, $50.000 cada
   una, reserva del depto (14 y 15/08). Ambas marcadas en su `desc`, falta
   confirmar cuál sobra.
5. **Expensas de septiembre ($125.000) no aparecen en ningún extracto** —
   no están cargadas.

## Categoría "Otros" pendiente

A la fecha de armado del dataset (423 movs), quedan ~65 egresos en "Otros"
que son transferencias a personas sin categoría clara (Sittner Luis, Luciano
Zolezzi, Matías Bedetti, etc.). Pendiente de categorización manual.
