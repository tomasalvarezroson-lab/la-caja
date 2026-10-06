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

## Bloque: Recurrente / Mudanza (one-off) / Ingreso / Reintegro (desde sept. 2026)

Desde el cierre de septiembre 2026 (mudanza al depto nuevo) cada fila puede
tener un campo `bloque`. Dice si el movimiento es gasto/ingreso **operativo**
("ritmo de crucero") o si es parte del **fondo de mudanza** (compras únicas
de ingreso al depto, financiadas aparte, que no deben ensuciar la tasa de
ahorro ni los promedios mensuales). Valores:

- `Recurrente`: egreso de consumo normal.
- `Mudanza (one-off)`: egreso o ingreso ligado al fondo de mudanza (depósito,
  muebles, equipamiento, regalos/aportes recibidos para financiarla, etc.).
  Se excluye tanto de "Gastos de consumo" como de "Ingresos" — ver `agg()`
  en `app.js`. Esto es intencional: `Categoría` dice **qué** es el gasto
  (p. ej. `Supermercado` para una compra grande de stock inicial), `Bloque`
  dice si **cuenta** para el ritmo normal del mes.
- `Ingreso`: ingreso operativo (sueldo, bono, rendimientos).
- `Reintegro`: entra como `reintegros` y neta contra "Gasto recurrente" en
  vez de sumar a "Ingresos" (`gastosNeto = gastos - reintegros` en `agg()`).

Las filas de antes de septiembre 2026 no tienen este campo. `getBloque(d)`
en `app.js` lo deriva en runtime (no se reescribió el histórico):
`Ingreso` + cat `Reintegro`/`Préstamo recibido` → `Reintegro`; cualquier
otro `Ingreso` → `Ingreso`; cualquier `Egreso` → `Recurrente`. Si se agrega
un bloque `Mudanza (one-off)` a una fila vieja a mano, hay que hacerlo
explícito en el dato (no hay forma de derivarlo retroactivamente sin
revisar cada fila).

Las tarjetas KPI "Gasto recurrente / Mudanza (one-off) / Resultado
operativo / Resultado total" (`#mudanzaRow` en `index.html`) solo se
muestran cuando el período filtrado tiene gasto con `bloque=Mudanza
(one-off)` — si no, el dashboard se ve exactamente igual que antes.

Ver `handoff_dashboard_septiembre_2026.md` (fuera del repo, en los chats de
cierre mensual) para el detalle fila por fila del cierre de septiembre.

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

## Categoría "Otros" pendiente

A la fecha de armado del dataset (423 movs), quedan ~65 egresos en "Otros"
que son transferencias a personas sin categoría clara (Sittner Luis, Luciano
Zolezzi, Matías Bedetti, etc.). Pendiente de categorización manual.
